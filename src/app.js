const state = {
  authMode: "login",
  currentUserId: null,
  data: emptyData(),
  savePromise: Promise.resolve(),
};

const elements = {
  authTitle: document.querySelector("#authTitle"),
  toggleAuthMode: document.querySelector("#toggleAuthMode"),
  authSubmit: document.querySelector("#authSubmit"),
  authForm: document.querySelector("#authForm"),
  authName: document.querySelector("#authName"),
  authEmail: document.querySelector("#authEmail"),
  authPassword: document.querySelector("#authPassword"),
  nameField: document.querySelector("#nameField"),
  appContent: document.querySelector("#appContent"),
  workspaceTemplate: document.querySelector("#workspaceTemplate"),
  welcomeMessage: document.querySelector("#welcomeMessage"),
  workspaceTitle: document.querySelector("#workspaceTitle"),
  logoutButton: document.querySelector("#logoutButton"),
  heroMovesCount: document.querySelector("#heroMovesCount"),
  heroContainersCount: document.querySelector("#heroContainersCount"),
  heroItemsCount: document.querySelector("#heroItemsCount"),
};

initialize();

async function initialize() {
  elements.toggleAuthMode.addEventListener("click", toggleAuthMode);
  elements.authForm.addEventListener("submit", handleAuthSubmit);
  elements.logoutButton.addEventListener("click", handleLogout);

  try {
    const session = await apiRequest("/api/session");
    if (session.user) setCustomerState(session.user, session.data);
  } catch (error) {
    window.alert(`MoveLedger could not connect to its backend: ${error.message}`);
  }
  render();
}

function emptyData() {
  return { users: [], moves: [], containers: [], items: [], photos: [], settings: { openAiApiKey: "" } };
}

function setCustomerState(user, data) {
  state.currentUserId = user.id;
  state.data = { ...emptyData(), ...data, users: [user] };
}

async function apiRequest(url, options = {}) {
  const response = await fetch(url, {
    credentials: "same-origin",
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const fallback = response.status === 404
      ? "Backend route not found. Open MoveLedger through its Node server, not VS Code Live Server."
      : `Backend request failed with HTTP ${response.status}.`;
    throw new Error(payload.error || fallback);
  }
  return payload;
}

function saveData() {
  if (!state.currentUserId) return;
  const snapshot = JSON.stringify(state.data);
  state.savePromise = state.savePromise
    .catch(() => undefined)
    .then(() => apiRequest("/api/data", { method: "PUT", body: snapshot }))
    .catch((error) => {
      console.error("Move data could not be saved.", error);
      window.alert(`Your latest change could not be saved: ${error.message}`);
    });
}

function toggleAuthMode() {
  state.authMode = state.authMode === "login" ? "register" : "login";
  renderAuth();
}

async function handleAuthSubmit(event) {
  event.preventDefault();
  const email = elements.authEmail.value.trim().toLowerCase();
  const password = elements.authPassword.value.trim();
  const name = elements.authName.value.trim();

  elements.authSubmit.disabled = true;
  elements.authSubmit.textContent = state.authMode === "register" ? "Creating..." : "Signing in...";
  try {
    const endpoint = state.authMode === "register" ? "/api/auth/register" : "/api/auth/login";
    const result = await apiRequest(endpoint, {
      method: "POST",
      body: JSON.stringify({ name, email, password }),
    });
    setCustomerState(result.user, result.data);
    elements.authForm.reset();
    render();
  } catch (error) {
    window.alert(error.message);
    renderAuth();
  } finally {
    elements.authSubmit.disabled = false;
  }
}

async function handleLogout() {
  await state.savePromise;
  try {
    await apiRequest("/api/auth/logout", { method: "POST", body: "{}" });
  } catch (error) {
    console.warn("Logout request failed.", error);
  }
  state.currentUserId = null;
  state.data = emptyData();
  render();
}

function render() {
  renderAuth();
  renderWorkspace();
  renderHeroStats();
}

function renderAuth() {
  const isRegister = state.authMode === "register";
  elements.authTitle.textContent = isRegister ? "Create Account" : "Log In";
  elements.toggleAuthMode.textContent = isRegister
    ? "Already have an account?"
    : "Need an account?";
  elements.authSubmit.textContent = isRegister ? "Create Account" : "Log In";
  elements.nameField.classList.toggle("field--hidden", !isRegister);
}

function renderHeroStats() {
  const moves = visibleMoves();
  const containers = visibleContainers();
  const items = visibleItems();

  elements.heroMovesCount.textContent = String(moves.length);
  elements.heroContainersCount.textContent = String(containers.length);
  elements.heroItemsCount.textContent = String(items.length);
}

function renderWorkspace() {
  const currentUser = getCurrentUser();
  elements.appContent.innerHTML = "";

  if (!currentUser) {
    elements.workspaceTitle.textContent = "Create and manage moving inventories";
    elements.welcomeMessage.textContent = "Not signed in";
    elements.appContent.innerHTML = `
      <div class="empty-state">
        <h3>Sign in to start a move record</h3>
        <p>
          Use the demo account or create your own. Each account has a private move history
          that remains available when the customer returns.
        </p>
      </div>
    `;
    return;
  }

  elements.workspaceTitle.textContent = "Move operations center";
  elements.welcomeMessage.textContent = `Signed in as ${currentUser.name}`;

  elements.appContent.append(elements.workspaceTemplate.content.cloneNode(true));

  wireWorkspaceEvents();
  renderOpsStrip();
  renderMovesList();
  renderSearchResults("");
}

function wireWorkspaceEvents() {
  document.querySelector("#moveForm").addEventListener("submit", handleCreateMove);
  document.querySelector("#globalSearch").addEventListener("input", (event) => {
    renderSearchResults(event.target.value);
  });
  document.querySelector("#aiSettingsForm").addEventListener("submit", handleAiSettingsSave);
  document.querySelector("#openAiKey").value =
    state.data.settings?.openAiApiKey || window.localStorage.getItem("move-ledger-openai-key") || "";
}

function handleCreateMove(event) {
  event.preventDefault();
  const currentUser = getCurrentUser();
  if (!currentUser) return;

  const form = event.currentTarget;
  const move = {
    id: crypto.randomUUID(),
    userId: currentUser.id,
    name: form.querySelector("#moveName").value.trim(),
    origin: form.querySelector("#moveOrigin").value.trim(),
    destination: form.querySelector("#moveDestination").value.trim(),
    moveDate: form.querySelector("#moveDate").value,
    status: "Planning",
    createdAt: new Date().toISOString(),
  };

  state.data.moves.unshift(move);
  saveData();
  form.reset();
  render();
}

function handleAiSettingsSave(event) {
  event.preventDefault();
  const key = document.querySelector("#openAiKey").value.trim();
  state.data.settings.openAiApiKey = key;
  window.localStorage.setItem("move-ledger-openai-key", key);
  saveData();
  window.alert(key ? "AI key saved in this browser." : "Stored AI key cleared.");
}

function renderMovesList() {
  const container = document.querySelector("#movesList");
  const moves = visibleMoves();

  if (moves.length === 0) {
    container.className = "moves-list empty-hint";
    container.textContent = "No moves yet. Create the first move above.";
    return;
  }

  container.className = "moves-list";
  container.innerHTML = moves
    .map((move) => {
      const containers = state.data.containers.filter((containerRecord) => containerRecord.moveId === move.id);
      const items = state.data.items.filter((item) => item.moveId === move.id);
      const labels = containers.length === 1 ? "container" : "containers";
      const itemLabel = items.length === 1 ? "item" : "items";

      return `
        <article class="move-card">
          <div class="move-card__header">
            <div>
              <p class="tag">${escapeHtml(move.status)}</p>
              <h4 class="move-card__title">${escapeHtml(move.name)}</h4>
            </div>
            <button class="secondary-button" type="button" data-action="toggle-move" data-move-id="${move.id}">
              Open Move
            </button>
          </div>
          <div class="move-card__meta">
            <span>${escapeHtml(move.origin)} to ${escapeHtml(move.destination)}</span>
            <span>Move date: ${formatDate(move.moveDate)}</span>
            <span>${containers.length} ${labels}, ${items.length} ${itemLabel}</span>
          </div>
          <div id="move-details-${move.id}" class="move-details" hidden></div>
        </article>
      `;
    })
    .join("");

  container.querySelectorAll('[data-action="toggle-move"]').forEach((button) => {
    button.addEventListener("click", () => toggleMoveDetails(button.dataset.moveId));
  });
}

function renderOpsStrip() {
  const containers = visibleContainers();
  const items = visibleItems();
  const photos = visiblePhotos();
  const readiness = containers.length
    ? Math.round(
        (containers.filter((container) =>
          items.some((item) => item.containerId === container.id),
        ).length /
          containers.length) *
          100,
      )
    : 0;
  const coverage = containers.length
    ? Math.round(
        (containers.filter((container) =>
          photos.some((photo) => photo.containerId === container.id),
        ).length /
          containers.length) *
          100,
      )
    : 0;
  const latestRecords = [...items, ...photos, ...containers, ...visibleMoves()]
    .map((record) => record.createdAt || record.updatedAt)
    .filter(Boolean)
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime());

  document.querySelector("#opsReadiness").textContent = `${readiness}%`;
  document.querySelector("#opsCoverage").textContent = `${coverage}%`;
  document.querySelector("#opsActivity").textContent = latestRecords[0]
    ? formatDate(latestRecords[0])
    : "No activity";
}

function toggleMoveDetails(moveId) {
  const target = document.querySelector(`#move-details-${CSS.escape(moveId)}`);
  const button = document.querySelector(`[data-action="toggle-move"][data-move-id="${moveId}"]`);
  const isHidden = target.hasAttribute("hidden");

  document.querySelectorAll(".move-details").forEach((panel) => panel.setAttribute("hidden", ""));
  document.querySelectorAll('[data-action="toggle-move"]').forEach((node) => {
    node.textContent = "Open Move";
  });

  if (!isHidden) {
    return;
  }

  target.removeAttribute("hidden");
  button.textContent = "Hide Move";
  target.innerHTML = buildMoveDetails(moveId);
  wireMoveDetailEvents(moveId);
  hydrateMoveDetailQr(moveId);
}

function buildMoveDetails(moveId) {
  const move = state.data.moves.find((record) => record.id === moveId);
  const containers = state.data.containers.filter((record) => record.moveId === moveId);
  const items = state.data.items.filter((record) => record.moveId === moveId);
  const photos = state.data.photos.filter((record) => record.moveId === moveId);

  return `
    <div class="move-sections">
      <div class="section-grid">
        <section class="card">
          <div class="card__header">
            <div>
              <p class="eyebrow">Add Container</p>
              <h3>Create a labeled bin or box</h3>
            </div>
          </div>
          <form class="stack" data-form="container" data-move-id="${moveId}">
            <label class="field">
              <span>Container name</span>
              <input name="name" type="text" placeholder="Master Closet Box 03" required />
            </label>
            <label class="field">
              <span>Current location</span>
              <input name="location" type="text" placeholder="Primary bedroom" required />
            </label>
            <label class="field">
              <span>Container type</span>
              <input name="type" type="text" placeholder="Wardrobe box, tote, crate..." required />
            </label>
            <label class="field">
              <span>Notes</span>
              <textarea name="notes" placeholder="High value uniforms, fragile decor, donation hold..."></textarea>
            </label>
            <button class="primary-button" type="submit">Create QR Container</button>
          </form>
        </section>

        <section class="card">
          <div class="card__header">
            <div>
              <p class="eyebrow">Move Snapshot</p>
              <h3>${escapeHtml(move.name)}</h3>
            </div>
            <span class="tag">${escapeHtml(move.status)}</span>
          </div>
          <div class="stack">
            <div class="record-row">
              <div>
                <strong>Route</strong>
                <p class="record-row__meta">${escapeHtml(move.origin)} to ${escapeHtml(move.destination)}</p>
              </div>
              <div>
                <strong>Date</strong>
                <p class="record-row__meta">${formatDate(move.moveDate)}</p>
              </div>
            </div>
            <div class="record-row">
              <div>
                <strong>Containers</strong>
                <p class="record-row__meta">${containers.length}</p>
              </div>
              <div>
                <strong>Logged Items</strong>
                <p class="record-row__meta">${items.length}</p>
              </div>
              <div>
                <strong>Photos</strong>
                <p class="record-row__meta">${photos.length}</p>
              </div>
            </div>
          </div>
        </section>
      </div>

      <section class="card">
        <div class="card__header">
          <div>
            <p class="eyebrow">Containers</p>
            <h3>Pack, print, and inventory by QR</h3>
          </div>
        </div>
        <div class="container-list">
          ${
            containers.length === 0
              ? `<div class="empty-hint">No containers yet. Create the first one for this move.</div>`
              : containers.map((container) => buildContainerCard(container)).join("")
          }
        </div>
      </section>
    </div>
  `;
}

function buildContainerCard(container) {
  const items = state.data.items.filter((record) => record.containerId === container.id);
  const photos = state.data.photos.filter((record) => record.containerId === container.id);

  return `
    <article class="container-card">
      <div class="container-card__header">
        <div>
          <h4 class="container-card__title">${escapeHtml(container.name)}</h4>
          <div class="pill-row">
            <span class="badge">${escapeHtml(container.type)}</span>
            <span class="badge">${escapeHtml(container.location)}</span>
          </div>
        </div>
        <div class="qr-frame" id="qr-${container.id}" data-qr-value="${escapeHtml(container.qrValue)}"></div>
      </div>
      <div class="container-card__meta">
        <span>${escapeHtml(container.notes || "No notes added yet.")}</span>
        <span>QR payload: ${escapeHtml(container.qrValue)}</span>
      </div>

      <div class="section-grid">
        <section class="card">
          <div class="card__header">
            <div>
              <p class="eyebrow">Add Items</p>
              <h3>Inventory for ${escapeHtml(container.name)}</h3>
            </div>
          </div>
          <form class="stack" data-form="item" data-container-id="${container.id}">
            <label class="field">
              <span>Item name</span>
              <input name="name" type="text" placeholder="Dress blues, monitor, winter coats..." required />
            </label>
            <div class="workspace-grid">
              <label class="field">
                <span>Quantity</span>
                <input name="quantity" type="number" min="1" value="1" required />
              </label>
              <label class="field">
                <span>Room / category</span>
                <input name="room" type="text" placeholder="Bedroom, office, kitchen..." required />
              </label>
            </div>
            <label class="field">
              <span>Notes</span>
              <textarea name="notes" placeholder="Condition, serial number, who packed it, claim notes..."></textarea>
            </label>
            <button class="primary-button" type="submit">Add Item</button>
          </form>
        </section>

        <section class="card">
          <div class="card__header">
            <div>
              <p class="eyebrow">Photos and AI</p>
              <h3>Capture contents from photos</h3>
            </div>
          </div>
          <form class="stack" data-form="photo" data-container-id="${container.id}">
            <label class="field">
              <span>Photo</span>
              <input name="photo" type="file" accept="image/*" required />
            </label>
            <label class="field">
              <span>Caption</span>
              <input name="caption" type="text" placeholder="Open-top photo before sealing box" />
            </label>
            <label class="field">
              <span>AI notes</span>
              <textarea name="prompt" placeholder="Optional hints: military uniforms, framed photos, coffee gear..."></textarea>
            </label>
            <div class="pill-row">
              <button class="primary-button" type="submit">Save Photo</button>
              <button class="secondary-button" type="button" data-action="run-demo-ai" data-container-id="${container.id}">
                AI Identify Latest Photo
              </button>
            </div>
            <small class="meta">
              Production note: for a live app, AI image analysis should run through a secure backend.
              This MVP includes a browser demo flow and an optional OpenAI direct-call hook.
            </small>
          </form>
        </section>
      </div>

      <div class="section-grid">
        <section class="card">
          <div class="card__header">
            <div>
              <p class="eyebrow">Itemized List</p>
              <h3>Contents logged for accountability</h3>
            </div>
          </div>
          <div class="items-list">
            ${
              items.length === 0
                ? `<div class="empty-hint">No items logged for this container yet.</div>`
                : items.map((item) => buildItemCard(item, container.moveId)).join("")
            }
          </div>
        </section>

        <section class="card">
          <div class="card__header">
            <div>
              <p class="eyebrow">Photo Records</p>
              <h3>Proof and visual references</h3>
            </div>
          </div>
          <div class="photos-grid">
            ${
              photos.length === 0
                ? `<div class="empty-hint">No photos yet. Upload one to preserve a visual record.</div>`
                : photos.map((photo) => buildPhotoCard(photo)).join("")
            }
          </div>
        </section>
      </div>

      <section class="card">
        <div class="card__header">
          <div>
            <p class="eyebrow">Inventory Document</p>
            <h3>Itemized records for claims and handoffs</h3>
          </div>
        </div>
        <div class="labels-grid">
          ${buildLabelCard(container)}
        </div>
      </section>
    </article>
  `;
}

function buildItemCard(item, moveId) {
  const moveContainers = state.data.containers.filter((record) => record.moveId === moveId);
  const options = moveContainers
    .map(
      (container) => `
        <option value="${container.id}" ${container.id === item.containerId ? "selected" : ""}>
          ${escapeHtml(container.name)}
        </option>
      `,
    )
    .join("");

  return `
    <article class="inventory-item">
      <div class="inventory-item__header">
        <div>
          <h5>${escapeHtml(item.name)}</h5>
          <p class="inventory-item__meta">
            Qty ${item.quantity} • ${escapeHtml(item.room)} • ${escapeHtml(item.status)}
          </p>
        </div>
        <span class="badge">${escapeHtml(item.source)}</span>
      </div>
      <p class="item-note">${escapeHtml(item.notes || "No extra notes.")}</p>
      <div class="item-actions">
        <label class="field">
          <span>Move to container</span>
          <select data-item-relocate="${item.id}">
            ${options}
          </select>
        </label>
        <button class="secondary-button" type="button" data-action="relocate-item" data-item-id="${item.id}">
          Update Location
        </button>
        <button class="ghost-button ghost-button--danger" type="button" data-action="remove-item" data-item-id="${item.id}">
          Remove Item
        </button>
      </div>
    </article>
  `;
}

function buildPhotoCard(photo) {
  return `
    <article class="photo-card">
      <img src="${photo.dataUrl}" alt="${escapeHtml(photo.caption || "Container photo")}" />
      <h5>${escapeHtml(photo.caption || "Container photo")}</h5>
      <p class="photo-caption">${escapeHtml(photo.aiSummary || "No AI summary yet.")}</p>
    </article>
  `;
}

function buildLabelCard(container) {
  const itemCount = state.data.items.filter((item) => item.containerId === container.id).length;
  const photoCount = state.data.photos.filter((photo) => photo.containerId === container.id).length;
  return `
    <article class="label-card" id="label-${container.id}">
      <div>
        <h5>${escapeHtml(container.name)}</h5>
        <p class="label-card__meta">${escapeHtml(container.type)} • ${escapeHtml(container.location)}</p>
        <p class="label-card__meta">${escapeHtml(container.notes || "No notes")}</p>
        <p class="label-card__meta">${itemCount} item${itemCount === 1 ? "" : "s"} &bull; ${photoCount} photo${photoCount === 1 ? "" : "s"}</p>
        <div class="label-card__actions">
          <button class="primary-button" type="button" data-action="print-inventory" data-container-id="${container.id}">
            Print / Save PDF
          </button>
        </div>
      </div>
    </article>
  `;
}

function wireMoveDetailEvents(moveId) {
  document
    .querySelector(`[data-form="container"][data-move-id="${moveId}"]`)
    .addEventListener("submit", handleCreateContainer);

  document.querySelectorAll(`[data-form="item"]`).forEach((form) => {
    form.addEventListener("submit", handleCreateItem);
  });

  document.querySelectorAll(`[data-form="photo"]`).forEach((form) => {
    form.addEventListener("submit", handleSavePhoto);
  });

  document.querySelectorAll('[data-action="remove-item"]').forEach((button) => {
    button.addEventListener("click", () => removeItem(button.dataset.itemId));
  });

  document.querySelectorAll('[data-action="relocate-item"]').forEach((button) => {
    button.addEventListener("click", () => relocateItem(button.dataset.itemId));
  });

  document.querySelectorAll('[data-action="print-inventory"]').forEach((button) => {
    button.addEventListener("click", () => printInventory(button.dataset.containerId));
  });

  document.querySelectorAll('[data-action="run-demo-ai"]').forEach((button) => {
    button.addEventListener("click", () => runAiForLatestPhoto(button.dataset.containerId));
  });
}

function hydrateMoveDetailQr(moveId) {
  state.data.containers
    .filter((record) => record.moveId === moveId)
    .forEach((container) => {
      renderQr(`qr-${container.id}`, container.qrValue);
    });
}

function renderQr(targetId, value) {
  const node = document.getElementById(targetId);
  if (!node || node.dataset.rendered === "true") return;

  new QRCode(node, {
    text: value,
    width: 104,
    height: 104,
    colorDark: "#1d1a17",
    colorLight: "#ffffff",
    correctLevel: QRCode.CorrectLevel.M,
  });

  node.dataset.rendered = "true";
}

function handleCreateContainer(event) {
  event.preventDefault();
  const currentUser = getCurrentUser();
  const moveId = event.currentTarget.dataset.moveId;
  const form = event.currentTarget;

  const container = {
    id: crypto.randomUUID(),
    moveId,
    userId: currentUser.id,
    name: form.elements.name.value.trim(),
    location: form.elements.location.value.trim(),
    type: form.elements.type.value.trim(),
    notes: form.elements.notes.value.trim(),
    qrValue: `moveledger://${moveId}/${Date.now().toString(36)}`,
    createdAt: new Date().toISOString(),
  };

  state.data.containers.unshift(container);
  saveData();
  toggleMoveDetails(moveId);
  toggleMoveDetails(moveId);
  renderHeroStats();
}

function handleCreateItem(event) {
  event.preventDefault();
  const currentUser = getCurrentUser();
  const containerId = event.currentTarget.dataset.containerId;
  const container = state.data.containers.find((record) => record.id === containerId);
  const form = event.currentTarget;

  const item = {
    id: crypto.randomUUID(),
    containerId,
    moveId: container.moveId,
    userId: currentUser.id,
    name: form.elements.name.value.trim(),
    quantity: Number(form.elements.quantity.value),
    room: form.elements.room.value.trim(),
    notes: form.elements.notes.value.trim(),
    source: "Manual",
    status: "Packed",
    createdAt: new Date().toISOString(),
  };

  state.data.items.unshift(item);
  saveData();
  form.reset();
  toggleMoveDetails(container.moveId);
  toggleMoveDetails(container.moveId);
  renderSearchResults(document.querySelector("#globalSearch")?.value || "");
  renderHeroStats();
}

async function handleSavePhoto(event) {
  event.preventDefault();
  const currentUser = getCurrentUser();
  const containerId = event.currentTarget.dataset.containerId;
  const container = state.data.containers.find((record) => record.id === containerId);
  const photoFile = event.currentTarget.elements.photo.files[0];

  if (!photoFile) {
    window.alert("Please choose a photo first.");
    return;
  }

  const dataUrl = await fileToDataUrl(photoFile);
  const aiNotes = event.currentTarget.elements.prompt.value.trim();
  const caption = event.currentTarget.elements.caption.value.trim();

  state.data.photos.unshift({
    id: crypto.randomUUID(),
    containerId,
    moveId: container.moveId,
    userId: currentUser.id,
    caption,
    prompt: aiNotes,
    dataUrl,
    aiSummary: "Photo saved. Run AI Identify Latest Photo to suggest item names.",
    createdAt: new Date().toISOString(),
  });

  saveData();
  event.currentTarget.reset();
  toggleMoveDetails(container.moveId);
  toggleMoveDetails(container.moveId);
}

async function runAiForLatestPhoto(containerId) {
  const container = state.data.containers.find((record) => record.id === containerId);
  const photos = state.data.photos.filter((photo) => photo.containerId === containerId);
  const latestPhoto = photos[0];

  if (!latestPhoto) {
    window.alert("Upload a photo before running AI inventory.");
    return;
  }

  let result = null;

  try {
    result = await runOpenAiVision(latestPhoto, container);
  } catch (error) {
    console.warn("OpenAI analysis unavailable, falling back to demo logic.", error);
  }

  if (!result) {
    result = runDemoVision(latestPhoto, container);
  }

  latestPhoto.aiSummary = result.summary;

  result.items.forEach((itemName) => {
    state.data.items.unshift({
      id: crypto.randomUUID(),
      containerId,
      moveId: container.moveId,
      userId: container.userId,
      name: itemName,
      quantity: 1,
      room: guessRoom(container, latestPhoto),
      notes: `AI-suggested from photo ${latestPhoto.caption || ""}`.trim(),
      source: result.source,
      status: "Packed",
      createdAt: new Date().toISOString(),
    });
  });

  saveData();
  toggleMoveDetails(container.moveId);
  toggleMoveDetails(container.moveId);
  renderSearchResults(document.querySelector("#globalSearch")?.value || "");
  renderHeroStats();
}

async function runOpenAiVision(photo, container) {
  const apiKey = state.data.settings?.openAiApiKey || window.localStorage.getItem("move-ledger-openai-key");
  if (!apiKey) return null;

  const prompt = [
    "Analyze this moving-box photo.",
    "Return JSON only with this shape: {\"summary\":\"...\",\"items\":[\"item 1\",\"item 2\"]}.",
    "List up to 8 likely visible household or personal items.",
    `Container: ${container.name}.`,
    photo.prompt ? `Hints: ${photo.prompt}` : "",
  ]
    .filter(Boolean)
    .join(" ");

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4.1-mini",
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: prompt },
            { type: "input_image", image_url: photo.dataUrl },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI request failed: ${response.status}`);
  }

  const payload = await response.json();
  const rawText =
    payload.output_text ||
    payload.output
      ?.flatMap((entry) => entry?.content || [])
      .map((part) => part?.text || "")
      .join(" ")
      .trim();
  if (!rawText) {
    throw new Error("No text returned from OpenAI.");
  }

  const parsed = JSON.parse(extractJson(rawText));
  return {
    summary: parsed.summary,
    items: Array.isArray(parsed.items) ? parsed.items.slice(0, 8) : [],
    source: "OpenAI Vision",
  };
}

function runDemoVision(photo, container) {
  const tokens = `${container.name} ${container.notes || ""} ${photo.caption || ""} ${photo.prompt || ""}`
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

  const suggestions = [];
  const keywordMap = [
    { match: ["kitchen", "dish", "coffee", "mug"], items: ["Coffee maker", "Mugs", "Utensils"] },
    { match: ["office", "desk", "monitor", "computer"], items: ["Monitor", "Keyboard", "Desk accessories"] },
    { match: ["uniform", "military", "service"], items: ["Uniform set", "Boots", "Award shadow box"] },
    { match: ["bedroom", "linen", "closet"], items: ["Folded linens", "Hangers", "Shoeboxes"] },
    { match: ["decor", "frame", "fragile"], items: ["Framed photos", "Decor accents", "Wrapped glassware"] },
  ];

  keywordMap.forEach((entry) => {
    if (entry.match.some((token) => tokens.includes(token))) {
      suggestions.push(...entry.items);
    }
  });

  if (suggestions.length === 0) {
    suggestions.push("Assorted household items", "Wrapped personal effects", "Small accessories");
  }

  return {
    summary: `Demo AI suggestion based on container details: ${suggestions.join(", ")}.`,
    items: [...new Set(suggestions)].slice(0, 5),
    source: "Demo AI",
  };
}

function relocateItem(itemId) {
  const item = state.data.items.find((record) => record.id === itemId);
  if (!item) return;

  const select = document.querySelector(`[data-item-relocate="${itemId}"]`);
  const newContainerId = select.value;
  const newContainer = state.data.containers.find((record) => record.id === newContainerId);

  item.containerId = newContainerId;
  item.moveId = newContainer.moveId;
  item.notes = `${item.notes ? `${item.notes} | ` : ""}Moved to ${newContainer.name} on ${new Date().toLocaleDateString()}`;

  saveData();
  render();
}

function removeItem(itemId) {
  state.data.items = state.data.items.filter((record) => record.id !== itemId);
  saveData();
  render();
}

function printInventory(containerId) {
  const container = state.data.containers.find((record) => record.id === containerId);
  const move = state.data.moves.find((record) => record.id === container.moveId);
  const items = state.data.items.filter((record) => record.containerId === containerId);
  const photos = state.data.photos.filter((record) => record.containerId === containerId);
  const totalQuantity = items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  const printWindow = window.open("", "_blank", "width=960,height=780");

  if (!printWindow) {
    window.alert("Please allow pop-ups to create the inventory PDF.");
    return;
  }

  const itemRows = items
    .map(
      (item) => `<tr>
        <td><strong>${escapeHtml(item.name)}</strong></td>
        <td>${Number(item.quantity) || 0}</td>
        <td>${escapeHtml(item.room)}</td>
        <td>${escapeHtml(item.status)}</td>
        <td>${escapeHtml(item.notes || "-")}</td>
      </tr>`,
    )
    .join("");
  const photoCards = photos
    .map(
      (photo) => `<figure>
        <img src="${photo.dataUrl}" alt="${escapeHtml(photo.caption || "Container contents")}" />
        <figcaption>${escapeHtml(photo.caption || "Container contents")}</figcaption>
      </figure>`,
    )
    .join("");

  printWindow.document.write(`
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <title>${escapeHtml(container.name)} Inventory</title>
        <style>
          @page { size: letter; margin: 0.55in; }
          * { box-sizing: border-box; }
          body { margin: 0; color: #1d1a17; font: 12px/1.45 Arial, sans-serif; }
          header { display: grid; grid-template-columns: 1fr 112px; gap: 28px; align-items: start; padding-bottom: 20px; border-bottom: 3px solid #bf5a36; }
          .brand { margin: 0 0 5px; color: #8f3f24; font-size: 11px; font-weight: 800; letter-spacing: .16em; text-transform: uppercase; }
          h1 { margin: 0; font-size: 27px; line-height: 1.15; }
          .subtitle { margin: 8px 0 0; color: #62574e; }
          .qr { width: 104px; height: 104px; padding: 6px; border: 1px solid #d9cec2; }
          .meta { display: grid; grid-template-columns: repeat(4, 1fr); margin: 20px 0; border: 1px solid #d9cec2; }
          .meta div { min-height: 62px; padding: 10px 12px; border-right: 1px solid #d9cec2; }
          .meta div:last-child { border-right: 0; }
          .label { display: block; margin-bottom: 4px; color: #76695e; font-size: 9px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; }
          .summary { display: flex; gap: 22px; margin: 0 0 12px; color: #62574e; }
          table { width: 100%; border-collapse: collapse; }
          th { padding: 9px 8px; background: #f2e7da; color: #5f2d1d; font-size: 9px; letter-spacing: .08em; text-align: left; text-transform: uppercase; }
          td { padding: 9px 8px; border-bottom: 1px solid #e3dad1; vertical-align: top; }
          th:nth-child(2), td:nth-child(2) { width: 48px; text-align: center; }
          .empty { padding: 20px; color: #76695e; text-align: center; border: 1px dashed #cbbcae; }
          h2 { margin: 24px 0 10px; font-size: 16px; }
          .photos { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
          figure { margin: 0; break-inside: avoid; }
          figure img { display: block; width: 100%; height: 132px; object-fit: cover; border: 1px solid #d9cec2; }
          figcaption { padding-top: 5px; color: #62574e; font-size: 10px; }
          footer { margin-top: 24px; padding-top: 10px; border-top: 1px solid #d9cec2; color: #76695e; font-size: 9px; }
        </style>
        <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"><\/script>
      </head>
      <body>
        <header>
          <div>
            <p class="brand">MoveLedger Inventory Record</p>
            <h1>${escapeHtml(container.name)}</h1>
            <p class="subtitle">${escapeHtml(move?.name || "Move record")} &middot; ${escapeHtml(move?.origin || "Origin not set")} to ${escapeHtml(move?.destination || "Destination not set")}</p>
          </div>
          <div id="document-qr" class="qr" aria-label="Container QR code"></div>
        </header>
        <section class="meta">
          <div><span class="label">Container</span><strong>${escapeHtml(container.type)}</strong></div>
          <div><span class="label">Location</span><strong>${escapeHtml(container.location)}</strong></div>
          <div><span class="label">Move date</span><strong>${formatDate(move?.moveDate)}</strong></div>
          <div><span class="label">Status</span><strong>${escapeHtml(move?.status || "Active")}</strong></div>
        </section>
        <p class="summary"><span><strong>${items.length}</strong> line items</span><span><strong>${totalQuantity}</strong> total units</span><span><strong>${photos.length}</strong> photos</span></p>
        ${container.notes ? `<p><strong>Container notes:</strong> ${escapeHtml(container.notes)}</p>` : ""}
        <h2>Itemized Contents</h2>
        ${items.length ? `<table><thead><tr><th>Item</th><th>Qty</th><th>Room / Category</th><th>Status</th><th>Notes</th></tr></thead><tbody>${itemRows}</tbody></table>` : `<div class="empty">No items have been logged for this container.</div>`}
        ${photos.length ? `<h2>Photo Evidence</h2><section class="photos">${photoCards}</section>` : ""}
        <footer>Generated ${escapeHtml(new Date().toLocaleString())} &middot; Record ID ${escapeHtml(container.id)}</footer>
      </body>
    </html>
  `);
  printWindow.document.close();
  printWindow.onload = () => {
    new printWindow.QRCode(printWindow.document.querySelector("#document-qr"), {
      text: container.qrValue,
      width: 90,
      height: 90,
      colorDark: "#111111",
      colorLight: "#ffffff",
    });
    window.setTimeout(() => {
      printWindow.focus();
      printWindow.print();
    }, 150);
  };
}

function renderSearchResults(query) {
  const container = document.querySelector("#searchResults");
  if (!container) return;

  const normalized = query.trim().toLowerCase();
  const hits = visibleItems().filter((item) => {
    const itemContainer = state.data.containers.find((record) => record.id === item.containerId);
    const haystack = [item.name, item.room, item.notes, itemContainer?.name, itemContainer?.location]
      .join(" ")
      .toLowerCase();
    return normalized.length === 0 ? false : haystack.includes(normalized);
  });

  if (!normalized) {
    container.className = "search-results empty-hint";
    container.textContent = "Search results will appear here.";
    return;
  }

  if (hits.length === 0) {
    container.className = "search-results empty-hint";
    container.textContent = "No matching items found in this account.";
    return;
  }

  container.className = "search-results";
  container.innerHTML = hits
    .map((item) => {
      const move = state.data.moves.find((record) => record.id === item.moveId);
      const itemContainer = state.data.containers.find((record) => record.id === item.containerId);
      return `
        <article class="search-hit">
          <strong>${escapeHtml(item.name)}</strong>
          <p class="search-pill">${escapeHtml(move?.name || "Unknown move")}</p>
          <p>${escapeHtml(itemContainer?.name || "Unknown container")} • ${escapeHtml(itemContainer?.location || "No location")}</p>
          <p class="item-note">${escapeHtml(item.notes || "No notes")}</p>
        </article>
      `;
    })
    .join("");
}

function getCurrentUser() {
  return state.data.users.find((user) => user.id === state.currentUserId) || null;
}

function visibleMoves() {
  return state.data.moves.filter((move) => move.userId === state.currentUserId);
}

function visibleContainers() {
  return state.data.containers.filter((record) => record.userId === state.currentUserId);
}

function visibleItems() {
  return state.data.items.filter((record) => record.userId === state.currentUserId);
}

function visiblePhotos() {
  return state.data.photos.filter((record) => record.userId === state.currentUserId);
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function guessRoom(container, photo) {
  const combined = `${container.name} ${container.notes || ""} ${photo.prompt || ""}`.toLowerCase();
  if (combined.includes("kitchen")) return "Kitchen";
  if (combined.includes("bedroom")) return "Bedroom";
  if (combined.includes("office")) return "Office";
  if (combined.includes("garage")) return "Garage";
  return "Mixed";
}

function formatDate(value) {
  if (!value) return "No date";
  const normalized = value.includes("T") ? value : `${value}T00:00:00`;
  return new Date(normalized).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function extractJson(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) {
    throw new Error("No JSON object found in model response.");
  }
  return text.slice(start, end + 1);
}
