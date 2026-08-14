const variant = window.__REFERENCE_FIXTURE_VARIANT__
  ?? new URLSearchParams(window.location.search).get("variant")
  ?? "initial";
const toggle = document.querySelector("#details-toggle");
const panel = document.querySelector("#details-panel");
const dynamicValue = document.querySelector("#dynamic-value");

document.body.dataset.variant = variant;
dynamicValue.value = `run-${Date.now().toString(36)}`;

toggle.addEventListener("click", () => {
  const nextExpanded = toggle.getAttribute("aria-expanded") !== "true";
  panel.hidden = !nextExpanded;
  toggle.setAttribute("aria-expanded", String(nextExpanded));
});

window.__REFERENCE_FIXTURE_READY__ = true;
