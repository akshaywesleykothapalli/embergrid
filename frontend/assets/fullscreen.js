function setupFullscreen(workspace, button, label, resized) {
  const dialog = document.getElementById("fullscreenDialog");
  const placeholder = document.createComment("Fullscreen workspace location");
  const originalLabel = button.textContent;
  let restoring = false;

  function restore() {
    if (restoring || !dialog.contains(workspace)) return;
    restoring = true;
    placeholder.replaceWith(workspace);
    workspace.classList.remove("map-expanded");
    document.body.classList.remove("workspace-expanded");
    button.setAttribute("aria-pressed", "false");
    button.textContent = originalLabel;
    resized();
    button.focus({preventScroll: true});
    restoring = false;
  }

  function close() {
    if (document.fullscreenElement === dialog) {
      document.exitFullscreen().catch(() => {});
    }
    dialog.close();
    restore();
  }

  button.onclick = () => {
    if (dialog.open) {
      close();
      return;
    }
    workspace.before(placeholder);
    dialog.append(workspace);
    workspace.classList.add("map-expanded");
    document.body.classList.add("workspace-expanded");
    dialog.showModal();
    button.textContent = "× Exit fullscreen";
    button.setAttribute("aria-pressed", "true");
    button.focus({preventScroll: true});
    resized();
    // The modal already fills the viewport when the host disallows native fullscreen.
    if (document.fullscreenEnabled && dialog.requestFullscreen) {
      dialog.requestFullscreen().then(resized).catch(() => {});
    }
  };
  dialog.addEventListener("close", restore);
  dialog.addEventListener("cancel", event => {
    event.preventDefault();
    close();
  });
  document.addEventListener("fullscreenchange", () => {
    if (!document.fullscreenElement && dialog.open) close();
  });
  dialog.setAttribute("aria-label", "Fullscreen " + label);
}
