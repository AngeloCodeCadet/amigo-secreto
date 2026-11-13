const $ = (id) => document.getElementById(id);
const state = {
    people: [],
    restrictions: [],
    draw: null
};

function showMessage(id, message) {
  const el = $(id); el.textContent = message; el.hidden = !message;
}
function normaliseName(name) { return name.trim().replace(/\s+/g, " "); }
function renderPeople() {
  const list = $("participantList");
  list.innerHTML = "";
  state.people.forEach((name, index) => {
    const li = document.createElement("li");
    const label = document.createElement("span"); label.textContent = name;
    const remove = document.createElement("button");
    remove.className = "remove"; remove.type = "button"; remove.textContent = "×";
    remove.setAttribute("aria-label", `Remover ${name}`);
    remove.addEventListener("click", () => {
    state.people.splice(index, 1);

    state.restrictions = state.restrictions.filter(
        restriction =>
            restriction.giver !== name &&
            restriction.recipient !== name
    );

    renderPeople();
});
    li.append(label, remove); list.append(li);
  });
  $("participantCount").textContent = state.people.length === 0
    ? "Ainda não adicionaste participantes."
    : `${state.people.length} participante${state.people.length === 1 ? "" : "s"} adicionado${state.people.length === 1 ? "" : "s"}.`;
  $("drawBtn").disabled = state.people.length < 3;
  renderRestrictionControls();
  renderRestrictions();
}
function renderRestrictionControls() {
    const giver = $("restrictionGiver");
    const recipient = $("restrictionRecipient");

    const previousGiver = giver.value;
    const previousRecipient = recipient.value;

    giver.innerHTML = '<option value="">Escolhe quem dá</option>';
    recipient.innerHTML = '<option value="">Escolhe quem não pode receber</option>';

    state.people.forEach(person => {
        const optionGiver = document.createElement("option");
        optionGiver.value = person;
        optionGiver.textContent = person;
        giver.appendChild(optionGiver);

        const optionRecipient = document.createElement("option");
        optionRecipient.value = person;
        optionRecipient.textContent = person;
        recipient.appendChild(optionRecipient);
    });

    giver.disabled = state.people.length < 2;
    recipient.disabled = state.people.length < 2;
    $("addRestrictionBtn").disabled = state.people.length < 2;

    if (state.people.includes(previousGiver)) giver.value = previousGiver;
    if (state.people.includes(previousRecipient)) recipient.value = previousRecipient;
}

function renderRestrictions() {
    const list = $("restrictionList");
    list.innerHTML = "";

    state.restrictions.forEach((restriction, index) => {
        const li = document.createElement("li");

        const description = document.createElement("span");
        description.textContent =
            `${restriction.giver} não pode tirar ${restriction.recipient}`;

        const removeButton = document.createElement("button");
        removeButton.type = "button";
        removeButton.textContent = "Remover";
        removeButton.addEventListener("click", () => {
            state.restrictions.splice(index, 1);
            renderRestrictions();
        });

        li.appendChild(description);
        li.appendChild(removeButton);
        list.appendChild(li);
    });
}
function addRestriction() {
    const giver = $("restrictionGiver").value;
    const recipient = $("restrictionRecipient").value;

    showMessage("setupError", "");

    if (!giver || !recipient) {
        showMessage("setupError", "Seleciona os dois participantes.");
        return;
    }

    if (giver === recipient) {
        showMessage("setupError", "Um participante não pode ser impedido de tirar a si próprio.");
        return;
    }

    if (state.restrictions.some(r =>
        r.giver === giver && r.recipient === recipient
    )) {
        showMessage("setupError", "Essa restrição já existe.");
        return;
    }

    state.restrictions.push({ giver, recipient });
    renderRestrictions();
}
function addPerson() {
  const name = normaliseName($("personName").value);
  showMessage("setupError", "");
  if (!name) return showMessage("setupError", "Escreve o nome de um participante.");
  if (state.people.some(p => p.toLocaleLowerCase("pt-PT") === name.toLocaleLowerCase("pt-PT")))
    return showMessage("setupError", "Esse nome já foi adicionado.");
  state.people.push(name); $("personName").value = ""; $("personName").focus(); renderPeople();
}
function secureShuffle(items) {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const x = new Uint32Array(1); crypto.getRandomValues(x);
    const j = x[0] % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function createValidAssignments() {
    const forbidden = new Map(
        state.people.map(person => [
            person,
            new Set(
                state.restrictions
                    .filter(r => r.giver === person)
                    .map(r => r.recipient)
            )
        ])
    );

    const givers = secureShuffle(state.people);
    const recipients = secureShuffle(state.people);

    const assigned = new Map();
    const used = new Set();

    function search(index) {
        if (index === givers.length) {
            return true;
        }

        const giver = givers[index];

        const candidates = secureShuffle(
            recipients.filter(recipient =>
                !used.has(recipient) &&
                recipient !== giver &&
                !forbidden.get(giver).has(recipient)
            )
        );

        for (const recipient of candidates) {
            assigned.set(giver, recipient);
            used.add(recipient);

            if (search(index + 1)) {
                return true;
            }

            assigned.delete(giver);
            used.delete(recipient);
        }

        return false;
    }

    if (!search(0)) {
        return null;
    }

    return state.people.map(person => ({
        person,
        recipient: assigned.get(person)
    }));
}
function randomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(8); crypto.getRandomValues(bytes);
  return Array.from(bytes, b => alphabet[b % alphabet.length]).join("");
}
async function deriveKey(code, salt) {
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(code), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({name:"PBKDF2", salt, iterations:180000, hash:"SHA-256"}, material,
    {name:"AES-GCM", length:256}, false, ["encrypt","decrypt"]);
}
function toB64(bytes) {
  let binary = ""; bytes.forEach(b => binary += String.fromCharCode(b));
  return btoa(binary).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}
function fromB64(value) {
  const base = value.replace(/-/g,"+").replace(/_/g,"/");
  const binary = atob(base + "=".repeat((4 - base.length % 4) % 4));
  return Uint8Array.from(binary, c => c.charCodeAt(0));
}
async function encryptResult(recipient, event, budget, code) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(code, salt);
  const payload = new TextEncoder().encode(JSON.stringify({recipient, event, budget}));
  const cipher = await crypto.subtle.encrypt({name:"AES-GCM", iv}, key, payload);
  return {s:toB64(salt), i:toB64(iv), d:toB64(new Uint8Array(cipher))};
}
function getBaseUrl() {
  return location.href.split("#")[0];
}
async function doDraw() {
  showMessage("setupError", "");
  if (state.people.length < 3) return;
  if (!window.crypto || !crypto.subtle) {
    return showMessage("setupError", "O teu navegador não permite a encriptação necessária. Abre a aplicação através de HTTPS (por exemplo, GitHub Pages) ou num navegador actualizado.");
  }
  const assignments = createValidAssignments();

if (!assignments) {
    showMessage(
        "setupError",
        "Não existe uma combinação possível com estas restrições. Remove uma ou mais restrições e tenta novamente."
    );
    return;
}
  const event = $("eventName").value.trim() || "Amigo Secreto";
  const budgetValue = $("budget").value.trim();
  const budget = budgetValue ? Number(budgetValue) : null;
  if (budgetValue && (!Number.isFinite(budget) || budget < 0)) return showMessage("setupError", "Indica um orçamento válido.");
  $("drawBtn").disabled = true; $("drawBtn").textContent = "A preparar os resultados…";
  try {
    const cards = [];
    for (const assignment of assignments) {
      const code = randomCode();
      const encrypted = await encryptResult(assignment.recipient, event, budget, code);
      const url = `${getBaseUrl()}#r=${encodeURIComponent(JSON.stringify(encrypted))}`;
      cards.push({person:assignment.person, code, url});
    }
    state.draw = cards;
    $("summaryEvent").textContent = event;
    $("summaryBudget").textContent = budget === null ? "Não definido" : `${budget.toFixed(2).replace(".",",")} €`;
    $("summaryCount").textContent = String(state.people.length);
    renderShareCards(cards);
    $("setupPanel").hidden = true; $("resultsPanel").hidden = false;
    window.scrollTo({top:0, behavior:"smooth"});
  } catch (err) {
    showMessage("setupError", "Não foi possível preparar o sorteio. Tenta novamente num navegador actualizado.");
    console.error(err);
  } finally {
    $("drawBtn").disabled = state.people.length < 3; $("drawBtn").textContent = "🎁 Fazer o sorteio";
  }
}
function renderShareCards(cards) {
  const holder = $("shareList");
  holder.innerHTML = "";

  cards.forEach(card => {
    const box = document.createElement("div");
    box.className = "share-card";

    const top = document.createElement("div");
    top.className = "share-top";

    const name = document.createElement("strong");
    name.textContent = card.person;

    const tag = document.createElement("span");
    tag.className = "tag";
    tag.textContent = "Resultado individual";

    top.append(name, tag);

    const url = document.createElement("div");
    url.className = "share-url";
    url.textContent = card.url;

    const row = document.createElement("div");
    row.className = "share-code";

    const codeLabel = document.createElement("span");
    codeLabel.textContent = "Código de acesso";

    const code = document.createElement("b");
    code.textContent = card.code;

    row.append(codeLabel, code);

    // Botão para copiar apenas o código
    const copyCode = document.createElement("button");
    copyCode.className = "mini-copy";
    copyCode.type = "button";
    copyCode.textContent = "Copiar código";

    copyCode.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(card.code);
        copyCode.textContent = "Copiado ✓";
      } catch {
        copyCode.textContent = "Erro ao copiar";
      }
    });

    // Mensagem pronta para WhatsApp
    const copyMessage = document.createElement("button");
    copyMessage.className = "mini-copy";
    copyMessage.type = "button";
    copyMessage.textContent = "Copiar mensagem";

    copyMessage.addEventListener("click", async () => {

      const message =
`Olá, ${card.person}! 🎁

Aqui está o teu resultado do Amigo Secreto:

${card.url}

Código de acesso: ${card.code}

Abre o link e cola o código para descobrires quem te calhou.

Não partilhes esta mensagem!

Boas festas! 🎄`;

      try {
        await navigator.clipboard.writeText(message);
        copyMessage.textContent = "Mensagem copiada ✓";
      } catch {
        copyMessage.textContent = "Erro ao copiar";
      }
    });

    const actions = document.createElement("div");
    actions.className = "card-actions";

    actions.append(copyCode, copyMessage);

    box.append(top, url, row, actions);
    holder.append(box);
  });
}
async function copyAll() {
  const text = state.draw.map(c => `${c.person}\nLink: ${c.url}\nCódigo: ${c.code}`).join("\n\n");
  try { await navigator.clipboard.writeText(text); $("copyAllBtn").textContent = "Copiado! ✓"; }
  catch { showMessage("revealError", "Não foi possível copiar automaticamente neste navegador."); }
}
function loadRecipientMode() {
  const match = location.hash.match(/^#r=(.+)$/);
  if (!match) return false;
  $("setupPanel").hidden = true; $("resultsPanel").hidden = true; $("revealPanel").hidden = false;
  try {
    const packet = JSON.parse(decodeURIComponent(match[1]));
    if (!packet.s || !packet.i || !packet.d) throw new Error("invalid");
    window.currentPacket = packet;
  } catch {
    $("revealEvent").textContent = "Link inválido";
    $("revealBtn").disabled = true;
  }
  return true;
}
async function reveal() {
  showMessage("revealError", ""); $("revealResult").hidden = true;
  const code = $("accessCode").value.trim().toUpperCase().replace(/[^A-Z0-9]/g,"");
  if (!code) return showMessage("revealError", "Introduz o código que recebeste.");
  try {
    const p = window.currentPacket;
    const key = await deriveKey(code, fromB64(p.s));
    const clear = await crypto.subtle.decrypt({name:"AES-GCM", iv:fromB64(p.i)}, key, fromB64(p.d));
    const data = JSON.parse(new TextDecoder().decode(clear));
    $("revealEvent").textContent = data.event;
    $("recipientName").textContent = data.recipient;
    $("revealBudget").textContent = data.budget === null ? "O orçamento não foi definido." : `Orçamento sugerido: ${Number(data.budget).toFixed(2).replace(".",",")} €`;
    $("revealResult").hidden = false;
    $("accessCode").disabled = true; $("revealBtn").hidden = true;
  } catch {
    showMessage("revealError", "Código incorrecto. Confirma o código recebido e tenta novamente.");
  }
}
function resetApp() {
  state.people = []; state.restrictions = [];
  $("resultsPanel").hidden = true; $("setupPanel").hidden = false;
  $("personName").value = ""; $("budget").value = ""; $("eventName").value = "Amigo Secreto de Natal";
  renderPeople(); window.scrollTo({top:0, behavior:"smooth"});
}
$("addBtn").addEventListener("click", addPerson);
$("personName").addEventListener("keydown", e => { if (e.key === "Enter") addPerson(); });
$("drawBtn").addEventListener("click", doDraw);
$("addRestrictionBtn").addEventListener("click", addRestriction);
$("copyAllBtn").addEventListener("click", copyAll);
$("newDrawBtn").addEventListener("click", resetApp);
$("revealBtn").addEventListener("click", reveal);
$("accessCode").addEventListener("keydown", e => { if (e.key === "Enter") reveal(); });
renderPeople();
loadRecipientMode();
