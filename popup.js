let bookmarks = [];
const storageKey = "localBookmarks";

function loadBookmarks() {
  chrome.storage.local.get(storageKey, (data) => {
    bookmarks = data[storageKey] || [];
    displayBookmarks();
  });
}

function saveBookmarks() {
  chrome.storage.local.set({ [storageKey]: bookmarks });
}

function displayBookmarks(filter = "") {
  const list = document.getElementById("bookmarks-list");
  list.innerHTML = "";
  const filtered = bookmarks.filter(
    (bm) =>
      bm.title.toLowerCase().includes(filter) ||
      bm.url.toLowerCase().includes(filter) ||
      bm.description.toLowerCase().includes(filter),
  );
  filtered.forEach((bm, index) => {
    const li = document.createElement("li");
    li.className = "bookmark-item";
    li.innerHTML = `
      <span class="bookmark-title">${bm.title}</span>
      <span class="actions">
        <button class="edit-btn" data-index="${index}">Edit</button>
        <button class="delete-btn" data-index="${index}">Delete</button>
      </span>
      <span class="bookmark-url"><a href="${bm.url}" target="_blank">${bm.url}</a></span>
      <span class="bookmark-desc">${bm.description}</span>
    `;
    list.appendChild(li);
  });

  // Event listeners for edit/delete
  document.querySelectorAll(".delete-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const index = parseInt(e.target.dataset.index);
      bookmarks.splice(index, 1);
      saveBookmarks();
      displayBookmarks(document.getElementById("search").value.toLowerCase());
    });
  });

  document.querySelectorAll(".edit-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const index = parseInt(e.target.dataset.index);
      const bm = bookmarks[index];
      const newTitle = prompt("Edit Title", bm.title);
      const newUrl = prompt("Edit URL", bm.url);
      const newDesc = prompt("Edit Description", bm.description);
      if (newTitle && newUrl) {
        bookmarks[index] = {
          title: newTitle,
          url: newUrl,
          description: newDesc || "",
        };
        saveBookmarks();
        displayBookmarks(document.getElementById("search").value.toLowerCase());
      }
    });
  });
}

async function getMeta(url) {
  try {
    const res = await fetch(url);
    const text = await res.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(text, "text/html");
    const title = doc.querySelector("title")?.textContent || url;
    const desc = doc.querySelector('meta[name="description"]')?.content || "";
    return { title, desc };
  } catch {
    return { title: url, desc: "" };
  }
}

document.addEventListener("DOMContentLoaded", () => {
  loadBookmarks();

  const search = document.getElementById("search");
  search.addEventListener("input", (e) => {
    displayBookmarks(e.target.value.toLowerCase());
  });

  const addBtn = document.getElementById("add-btn");
  addBtn.addEventListener("click", async () => {
    let title = document.getElementById("add-title").value.trim();
    const url = document.getElementById("add-url").value.trim();
    let desc = document.getElementById("add-desc").value.trim();

    if (url) {
      if (!title || !desc) {
        const meta = await getMeta(url);
        if (!title) title = meta.title;
        if (!desc) desc = meta.desc;
      }
      if (title) {
        bookmarks.push({ title, url, description: desc });
        saveBookmarks();
        displayBookmarks(search.value.toLowerCase());
        document.getElementById("add-title").value = "";
        document.getElementById("add-url").value = "";
        document.getElementById("add-desc").value = "";
      }
    }
  });

  const importBtn = document.getElementById("import-btn");
  importBtn.addEventListener("click", () => {
    chrome.bookmarks.getTree((tree) => {
      function flatten(node) {
        console.log(`node:`, node);
        if (node.url) {
          if (!bookmarks.some((bm) => bm.url === node.url)) {
            bookmarks.push({
              title: node.title || node.url,
              url: node.url,
              description: "",
            });
          }
        }
        if (node.children) {
          node.children.forEach(flatten);
        }
      }
      tree.forEach(flatten);
      saveBookmarks();
      displayBookmarks(search.value.toLowerCase());
    });
  });
});
