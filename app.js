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

let html5QrCode = null;
let torchOn = false;
let lastText = "";
let scanning = false;

function isProbablyUrl(s) {
  try { new URL(s); return true; } catch { return false; }
}

function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.value = 880;
    g.gain.value = 0.03;
    o.connect(g); g.connect(ctx.destination);
    o.start();
    setTimeout(() => { o.stop(); ctx.close(); }, 120);
  } catch { /* ignore */ }
}

function vibrate() {
  if (navigator.vibrate) navigator.vibrate(80);
}

function showModal({ text, formatName }) {
  resultFormat.textContent = formatName || "—";
  resultText.textContent = text || "—";

  btnOpen.disabled = !isProbablyUrl(text);
  btnOpen.style.opacity = btnOpen.disabled ? "0.5" : "1";

  modal.classList.remove("hidden");
}

function hideModal() {
  modal.classList.add("hidden");
}

async function setTorchVisibleIfSupported() {
  // Html5Qrcode has applyVideoConstraints; check capabilities before showing torch button. :contentReference[oaicite:2]{index=2}
  try {
    const caps = await html5QrCode.getRunningTrackCapabilities?.();
    const hasTorch = !!caps && ("torch" in caps || (caps.advanced && caps.advanced.some(a => "torch" in a)));
    btnTorch.style.display = hasTorch ? "grid" : "none";
  } catch {
    btnTorch.style.display = "none";
  }
}

async function toggleTorch() {
  try {
    torchOn = !torchOn;
    await html5QrCode.applyVideoConstraints({
      advanced: [{ torch: torchOn }]
    });
    btnTorch.style.opacity = torchOn ? "1" : "0.7";
  } catch {
    // If it fails on device/browser, hide it.
    btnTorch.style.display = "none";
  }
}

function supportedFormatsForYourImage() {
  // Covers everything in your image EXCEPT “MS1 Plessey”.
  // “Databar” == RSS_14 / RSS_EXPANDED (GS1 DataBar).
  return [
    Html5QrcodeSupportedFormats.QR_CODE,
    Html5QrcodeSupportedFormats.AZTEC,
    Html5QrcodeSupportedFormats.DATA_MATRIX,
    Html5QrcodeSupportedFormats.PDF_417,

    Html5QrcodeSupportedFormats.CODE_39,
    Html5QrcodeSupportedFormats.CODE_93,
    Html5QrcodeSupportedFormats.CODE_128,
    Html5QrcodeSupportedFormats.ITF,

    Html5QrcodeSupportedFormats.EAN_13,
    Html5QrcodeSupportedFormats.EAN_8,
    Html5QrcodeSupportedFormats.UPC_A,
    Html5QrcodeSupportedFormats.UPC_E,

    Html5QrcodeSupportedFormats.CODABAR,

    Html5QrcodeSupportedFormats.RSS_14,
    Html5QrcodeSupportedFormats.RSS_EXPANDED,
  ];
}

async function start() {
  if (scanning) return;

  // html5-qrcode injects its own <video> under #reader.
  html5QrCode = new Html5Qrcode("reader", {
    formatsToSupport: supportedFormatsForYourImage()
  });

  const config = {
    fps: 12,
    // Keep scanning area large for 1D codes; the overlay is purely visual.
    aspectRatio: 1.777778,
    disableFlip: false,
    // Optional: enable BarcodeDetector (experimental) if supported by browser.
    // experimentalFeatures: { useBarCodeDetectorIfSupported: true }
  };

  const onSuccess = async (decodedText, decodedResult) => {
    // basic de-dupe so it doesn’t spam the modal
    if (!decodedText || decodedText === lastText) return;
    lastText = decodedText;

    beep();
    vibrate();

    // Pause scanning while showing modal
    try { await html5QrCode.pause?.(true); } catch { /* ignore */ }

    const fmt = decodedResult?.result?.format?.formatName
      || decodedResult?.result?.format?.format
      || decodedResult?.decodedResult?.format
      || decodedResult?.format?.formatName
      || decodedResult?.format?.name
      || decodedResult?.formatName
      || "Unknown";

    showModal({ text: decodedText, formatName: fmt });
  };

  const onError = (_err) => {
    // ignore per-frame decode errors
  };

  scanning = true;

  // Prefer rear camera
  await html5QrCode.start(
    { facingMode: "environment" },
    config,
    onSuccess,
    onError
  );

  await setTorchVisibleIfSupported();
}

async function resumeScanning() {
  hideModal();
  lastText = ""; // allow scanning same code again
  try { await html5QrCode.resume?.(); } catch { /* ignore */ }
}

async function stopAndExit() {
  try {
    if (html5QrCode) {
      await html5QrCode.stop();
      await html5QrCode.clear();
    }
  } catch { /* ignore */ }
  scanning = false;
  hideModal();
  alert("Scanner stopped.");
}

btnTorch.addEventListener("click", () => toggleTorch());
btnHelp.addEventListener("click", () => {
  alert(
    [
      "Supported (this app):",
      "UPC-A / UPC-E, EAN-13 / EAN-8, Code 39, Code 93, Code 128, ITF, Codabar,",
      "QR, Data Matrix, PDF417, Aztec, GS1 DataBar (RSS-14 / RSS-Expanded).",
      "",
      "Not supported here: MS1 Plessey (not available in html5-qrcode supported formats)."
    ].join("\n")
  );
});
btnClose.addEventListener("click", () => stopAndExit());

btnModalClose.addEventListener("click", () => resumeScanning());
btnScanAgain.addEventListener("click", () => resumeScanning());

btnCopy.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(resultText.textContent || "");
    btnCopy.textContent = "Copied";
    setTimeout(() => (btnCopy.textContent = "Copy"), 900);
  } catch {
    alert("Copy failed (clipboard permission).");
  }
});

btnOpen.addEventListener("click", () => {
  const text = resultText.textContent || "";
  if (!isProbablyUrl(text)) return;
  window.open(text, "_blank", "noopener,noreferrer");
});

window.addEventListener("load", () => {
  // getUserMedia requires HTTPS secure context (GitHub Pages is fine). :contentReference[oaicite:3]{index=3}
  start().catch((e) => {
    console.error(e);
    alert(
      "Camera start failed.\n" +
      "- Use HTTPS (GitHub Pages).\n" +
      "- Allow camera permission.\n" +
      "- On iOS, use Safari (iOS support depends on version)."
    );
  });
});

