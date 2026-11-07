import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { GOOGLE_PHOTOS_SOURCE, isGooglePhotosMessage } from "./lib/googlePhotos";
import { applyTheme, currentTheme } from "./lib/theme";
import "./index.css";

applyTheme(currentTheme());

// The Google Photos OAuth round trip lands back here, in the popup tab it started in
// (`?gp=connected`). Rather than render a whole second copy of the app the user then has to
// notice and close themselves, ask its opener what to do next: it replies either with the
// actual picker to continue to (so connecting flows straight into picking, one popup, one
// click) or to just close. A `window.open` from the opener's reply handler would risk being
// blocked as not user-initiated, so the popup navigates *itself* instead.
const url = new URL(window.location.href);
if (url.searchParams.get("gp") === "connected" && window.opener) {
  document.title = "Google Foto's";
  document.body.textContent = "Verbonden met Google Foto's. Dit tabblad sluit automatisch…";
  const giveUp = window.setTimeout(() => window.close(), 5000);
  window.addEventListener("message", (event) => {
    if (event.origin !== window.location.origin || !isGooglePhotosMessage(event.data)) return;
    if (event.data.type === "continue") {
      window.clearTimeout(giveUp);
      window.location.href = event.data.pickerUri;
    } else if (event.data.type === "close") {
      window.close();
    }
  });
  window.opener.postMessage({ source: GOOGLE_PHOTOS_SOURCE, type: "connected" }, window.location.origin);
} else {
  if (url.searchParams.has("gp")) {
    url.searchParams.delete("gp");
    window.history.replaceState(null, "", url.pathname + (url.search ? url.search : "") + url.hash);
  }
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
