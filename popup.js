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

function loadBookmarks(filter) {
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
    displayBookmarks(bookmarks, filter);
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
    li.className = "bookmark-item";
    li.innerHTML = `
      <span class="bookmark-title">${bm.visibleTitle}</span>
      <span class="actions">
        <button class="edit-btn" data-id="${bm.id}">Edit</button>
        <button class="delete-btn" data-id="${bm.id}">Delete</button>
      </span>
      <span class="bookmark-url"><a href="${bm.url}" target="_blank">${bm.url}</a></span>
      <span class="bookmark-desc">${bm.description}</span>
    `;
    list.appendChild(li);
  });

  // Event listeners
  document.querySelectorAll(".delete-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const id = e.target.dataset.id;
      chrome.bookmarks.remove(id, () => loadBookmarks());
    });
  });

  document.querySelectorAll(".edit-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const id = e.target.dataset.id;
      chrome.bookmarks.get(id, ([bm]) => {
        const { visibleTitle, description } = parseBookmarkTitle(bm.title);
        const newVisible = prompt("Edit Visible Title", visibleTitle);
        const newUrl = prompt("Edit URL", bm.url);
        const newDesc = prompt("Edit Description", description);
        if (newVisible && newUrl) {
          const hidden = encodeToZeroWidth(newDesc);
          const newTitle = newVisible + hidden;
          chrome.bookmarks.update(id, { title: newTitle, url: newUrl }, () =>
            loadBookmarks(),
          );
        }
      });
    });
  });
}

document.addEventListener("DOMContentLoaded", () => {
  loadBookmarks();

  const search = document.getElementById("search");
  search.addEventListener("input", (e) => {
    loadBookmarks(e.target.value); // Reload and filter
    // Note: displayBookmarks is called inside load, but to filter, we'd need to pass the current bookmarks; for simplicity, reload each time (fast for typical bookmark counts)
  });

  const addBtn = document.getElementById("add-btn");
  addBtn.addEventListener("click", () => {
    const visibleTitle = prompt("Visible Title (required)");
    const url = prompt("URL (required)");
    const desc = prompt("Description (optional, will be hidden)");
    if (visibleTitle && url) {
      const hidden = encodeToZeroWidth(desc);
      const title = visibleTitle + hidden;
      chrome.bookmarks.create({ title, url }, () => loadBookmarks());
    }
  });
});
