const ZERO_0 = "\u200C"; // ZWNJ for binary 0
const ZERO_1 = "\u200D"; // ZWJ for binary 1
const ZERO_REGEX = /[\u200C\u200D]/g; // Matches our zero-width chars

function encodeToZeroWidth(text) {
  if (!text) return "";
  const encoder = new TextEncoder();
  const bytes = encoder.encode(text);
  let binary = "";
  for (let byte of bytes) {
    binary += byte.toString(2).padStart(8, "0");
  }
  return binary
    .split("")
    .map((bit) => (bit === "0" ? ZERO_0 : ZERO_1))
    .join("");
}

function decodeFromZeroWidth(sequence) {
  if (sequence.length % 8 !== 0) return ""; // Invalid: not full bytes
  let binary = sequence
    .split("")
    .map((c) => (c === ZERO_0 ? "0" : "1"))
    .join("");
  let bytes = [];
  for (let i = 0; i < binary.length; i += 8) {
    bytes.push(parseInt(binary.substring(i, i + 8), 2));
  }
  const decoder = new TextDecoder();
  return decoder.decode(new Uint8Array(bytes));
}

function parseBookmarkTitle(title) {
  const visibleTitle = title.replace(ZERO_REGEX, "");
  const zeroWidthSequence = (title.match(ZERO_REGEX) || []).join("");
  const description = decodeFromZeroWidth(zeroWidthSequence);
  return { visibleTitle: visibleTitle || title, description };
}

async function fetchMetaDescription(url) {
  try {
    const res = await fetch(url);
    const text = await res.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(text, "text/html");
    return doc.querySelector('meta[name="description"]')?.content || "";
  } catch {
    return "";
  }
}

function loadBookmarks(callback) {
  chrome.bookmarks.getTree((tree) => {
    let bookmarks = [];
    function flatten(node) {
      if (node.url) {
        const { visibleTitle, description } = parseBookmarkTitle(node.title);
        bookmarks.push({
          id: node.id,
          visibleTitle,
          url: node.url,
          description,
        });
      }
      if (node.children) node.children.forEach(flatten);
    }
    tree.forEach(flatten);
    callback(bookmarks);
  });
}

function displayBookmarks(bookmarks, filter = "") {
  const list = document.getElementById("bookmarks-list");
  list.innerHTML = "";
  const filtered = bookmarks.filter(
    (bm) =>
      bm.visibleTitle.toLowerCase().includes(filter) ||
      bm.url.toLowerCase().includes(filter) ||
      bm.description.toLowerCase().includes(filter),
  );
  filtered.forEach((bm) => {
    const li = document.createElement("li");
    li.innerHTML = `
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">${bm.visibleTitle}</h3>
        </div>
        <div class="card-content">
          <div class="bookmark-url"><a href="${bm.url}" target="_blank">${bm.url}</a></div>
          <p class="card-description">${bm.description}</p>
          <div class="actions">
            <button class="button button-outline button-small edit-btn" data-id="${bm.id}">Edit</button>
            <button class="button button-outline button-small delete-btn" data-id="${bm.id}">Delete</button>
          </div>
        </div>
      </div>
    `;
    list.appendChild(li);
  });

  // Event listeners
  document.querySelectorAll(".delete-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const id = e.target.dataset.id;
      if (confirm("Are you sure you want to delete this bookmark?")) {
        chrome.bookmarks.remove(id, () =>
          loadBookmarks((bms) =>
            displayBookmarks(
              bms,
              document.getElementById("search").value.toLowerCase(),
            ),
          ),
        );
      }
    });
  });

  document.querySelectorAll(".edit-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const id = e.target.dataset.id;
      const bmArray = await new Promise((resolve) =>
        chrome.bookmarks.get(id, resolve),
      );
      const bm = bmArray[0];
      const { visibleTitle, description } = parseBookmarkTitle(bm.title);
      const newVisible = prompt("Edit Visible Title", visibleTitle);
      if (newVisible === null || !newVisible) return;
      const newUrl = prompt("Edit URL", bm.url);
      if (newUrl === null || !newUrl) return;
      let newDesc = prompt("Edit Description", description);
      if (newDesc === null) return;
      if (newDesc === "") {
        newDesc = await fetchMetaDescription(newUrl);
      }
      const hidden = encodeToZeroWidth(newDesc);
      const newTitle = newVisible + hidden;
      chrome.bookmarks.update(id, { title: newTitle, url: newUrl }, () =>
        loadBookmarks((bms) =>
          displayBookmarks(
            bms,
            document.getElementById("search").value.toLowerCase(),
          ),
        ),
      );
    });
  });
}

document.addEventListener("DOMContentLoaded", () => {
  const search = document.getElementById("search");
  loadBookmarks((bookmarks) => {
    displayBookmarks(bookmarks);
    search.focus(); // Focus on search input after loading
  });

  search.addEventListener("input", (e) => {
    loadBookmarks((bookmarks) =>
      displayBookmarks(bookmarks, e.target.value.toLowerCase()),
    );
  });

  const addBtn = document.getElementById("add-btn");
  addBtn.addEventListener("click", async () => {
    const visibleTitle = prompt("Visible Title (required)");
    if (visibleTitle === null || !visibleTitle) return;
    const url = prompt("URL (required)");
    if (url === null || !url) return;
    let desc = prompt("Description (optional, will be hidden)");
    if (desc === null) return;
    if (desc === "") {
      desc = await fetchMetaDescription(url);
    }
    const hidden = encodeToZeroWidth(desc);
    const title = visibleTitle + hidden;
    chrome.bookmarks.create({ title, url }, () =>
      loadBookmarks((bms) =>
        displayBookmarks(
          bms,
          document.getElementById("search").value.toLowerCase(),
        ),
      ),
    );
  });
});
