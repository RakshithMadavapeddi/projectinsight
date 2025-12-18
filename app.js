/* global Html5Qrcode, Html5QrcodeSupportedFormats */

const el = (id) => document.getElementById(id);

const btnTorch = el("btnTorch");
const btnHelp = el("btnHelp");
const btnClose = el("btnClose");

const modal = el("modal");
const btnModalClose = el("btnModalClose");
const btnCopy = el("btnCopy");
const btnOpen = el("btnOpen");
const btnScanAgain = el("btnScanAgain");

const resultFormat = el("resultFormat");
const resultText = el("resultText");

// (Optional) status UI if you added it
const statusPill = document.getElementById("statusPill");
const startOverlay = document.getElementById("startOverlay");
const btnStart = document.getElementById("btnStart");

let html5QrCode = null;
let scanning = false;
let torchOn = false;
let lastText = "";
let lastFailureAt = 0;

function setStatus(msg) {
  if (statusPill) statusPill.textContent = msg;
}

function isProbablyUrl(s) {
  try { new URL(s); return true; } catch { return false; }
}

function showModal({ text, formatName }) {
  resultFormat.textContent = formatName || "—";
  resultText.textContent = text || "—";

  const canOpen = isProbablyUrl(text);
  btnOpen.disabled = !canOpen;
  btnOpen.style.opacity = canOpen ? "1" : "0.5";

  modal.classList.remove("hidden");
}

function hideModal() {
  modal.classList.add("hidden");
}

function supportedFormats() {
  // Covers everything in your picture except “MS1 Plessey”
  return [
    // 2D
    Html5QrcodeSupportedFormats.QR_CODE,
    Html5QrcodeSupportedFormats.AZTEC,
    Html5QrcodeSupportedFormats.DATA_MATRIX,
    Html5QrcodeSupportedFormats.PDF_417,

    // 1D
    Html5QrcodeSupportedFormats.CODE_39,
    Html5QrcodeSupportedFormats.CODE_93,
    Html5QrcodeSupportedFormats.CODE_128,
    Html5QrcodeSupportedFormats.ITF,
    Html5QrcodeSupportedFormats.CODABAR,

    Html5QrcodeSupportedFormats.EAN_13,
    Html5QrcodeSupportedFormats.EAN_8,
    Html5QrcodeSupportedFormats.UPC_A,
    Html5QrcodeSupportedFormats.UPC_E,

    // GS1 DataBar (Databar)
    Html5QrcodeSupportedFormats.RSS_14,
    Html5QrcodeSupportedFormats.RSS_EXPANDED,
  ];
}

async function startScanner() {
  if (scanning) return;

  if (!window.Html5Qrcode) {
    alert("html5-qrcode did not load. Check your script tag / CDN.");
    return;
  }

  setStatus("Starting camera…");

  html5QrCode = new Html5Qrcode("reader", {
    formatsToSupport: supportedFormats(),
  });

  // IMPORTANT for PDF417:
  // - Lower FPS (more time per frame decode)
  // - Tall scan region (PDF417 is stacked rows)
  // - Disable native BarcodeDetector path (PDF417 often fails there)
  const config = {
    fps: 20,
    disableFlip: false,
    // Big region (near full frame) helps PDF417 a lot
    qrbox: (vw, vh) => {
  // Near-100% of the visible frame (safer than exactly 1.0)
  const w = Math.floor(vw * 0.98);
  const h = Math.floor(vh * 0.98);

  // Keep dimensions even (some pipelines behave better with even sizes)
  return {
    width: w - (w % 2),
    height: h - (h % 2),
  };
},

    experimentalFeatures: {
      // Force ZXing-js path for consistency (PDF417 especially)
      useBarCodeDetectorIfSupported: false,
    },
  };

  const onSuccess = async (decodedText, decodedResult) => {
    if (!decodedText) return;

    // simple de-dupe
    if (decodedText === lastText) return;
    lastText = decodedText;

    console.log("SCAN SUCCESS:", decodedText, decodedResult);
    setStatus("Scanned");

    // Stop scanning while modal is open (more stable than pause on some devices)
    try { await html5QrCode.stop(); } catch {}
    scanning = false;

    const fmt =
      decodedResult?.result?.format?.formatName ||
      decodedResult?.decodedResult?.format ||
      decodedResult?.formatName ||
      "Unknown";

    showModal({ text: decodedText, formatName: fmt });
  };

  const onFailure = (_err) => {
    // Called frequently; keep light
    lastFailureAt = Date.now();
  };

  // Ask for higher resolution (PDF417 needs pixels)
  const cameraConstraints = {
    facingMode: { ideal: "environment" },
    width: { ideal: 1920 },
    height: { ideal: 1080 },
  };

  try {
    await html5QrCode.start(cameraConstraints, config, onSuccess, onFailure);
    scanning = true;
    setStatus("Scanning…");
  } catch (e) {
    console.error(e);
    setStatus("Camera error");
    alert(
      "Camera start failed.\n" +
      "1) Allow camera permission\n" +
      "2) Must be HTTPS (GitHub Pages)\n" +
      (e?.message || e)
    );
  }
}

async function restartScanner() {
  hideModal();
  lastText = "";

  try {
    if (html5QrCode) {
      await html5QrCode.clear();
    }
  } catch {}

  scanning = false;
  await startScanner();
}

async function stopScanner() {
  try {
    if (html5QrCode) {
      if (scanning) await html5QrCode.stop();
      await html5QrCode.clear();
    }
  } catch {}
  scanning = false;
  hideModal();
  setStatus("Stopped");
}

async function toggleTorch() {
  try {
    torchOn = !torchOn;
    await html5QrCode.applyVideoConstraints({ advanced: [{ torch: torchOn }] });
    btnTorch.style.opacity = torchOn ? "1" : "0.7";
  } catch {
    // if unsupported on device/browser, hide it
    btnTorch.style.display = "none";
  }
}

// Optional: status heartbeat (shows it is running)
setInterval(() => {
  if (!scanning) return;
  const age = Date.now() - lastFailureAt;
  if (age > 1400) setStatus("Point camera at a barcode…");
  else setStatus("Scanning…");
}, 700);

// UI bindings
btnTorch?.addEventListener("click", () => toggleTorch());

btnHelp?.addEventListener("click", () => {
  alert(
    [
      "Supported here:",
      "UPC-A / UPC-E, EAN-13 / EAN-8, Code 39, Code 93, Code 128, ITF, Codabar,",
      "QR, Data Matrix, PDF417, Aztec, GS1 DataBar (RSS-14 / RSS-Expanded).",
      "",
      "Not supported: MS1 Plessey (not available in html5-qrcode formats).",
      "",
      "PDF417 tips:",
      "- Bright light / torch",
      "- Hold steady, reduce angle/skew",
      "- Move closer until it is sharp",
    ].join("\n")
  );
});

btnClose?.addEventListener("click", async () => {
  await stopScanner();
  alert("Scanner stopped.");
});

// Modal actions
btnModalClose?.addEventListener("click", () => restartScanner());
btnScanAgain?.addEventListener("click", () => restartScanner());

btnCopy?.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(resultText.textContent || "");
    btnCopy.textContent = "Copied";
    setTimeout(() => (btnCopy.textContent = "Copy"), 900);
  } catch {
    alert("Copy failed (clipboard permission).");
  }
});

btnOpen?.addEventListener("click", () => {
  const text = resultText.textContent || "";
  if (!isProbablyUrl(text)) return;
  window.open(text, "_blank", "noopener,noreferrer");
});

// Start strategy:
// - If you added Tap-to-start overlay, use it.
// - Otherwise start on load.
if (btnStart && startOverlay) {
  setStatus("Not started");
  btnStart.addEventListener("click", async () => {
    startOverlay.classList.add("hidden");
    await startScanner();
  });
} else {
  window.addEventListener("load", () => {
    startScanner();
  });
}
