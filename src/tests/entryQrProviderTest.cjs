(async () => {
  const assert = (condition, message) => {
    if(!condition){
      throw new Error(message);
    }
  };

  const { buildQrProviderUrl } = await import("../services/entry/entryQr.js");

  const providerUrl = buildQrProviderUrl("https://www.totemv.com/salon/prod-test", {
    size: 512,
    margin: 0
  });

  assert(providerUrl.startsWith("https://api.qrserver.com/v1/create-qr-code/?"), "QR_PROVIDER_HOST_FAILED");
  assert(providerUrl.includes("format=png"), "QR_PROVIDER_FORMAT_FAILED");
  assert(providerUrl.includes("size=512x512"), "QR_PROVIDER_SIZE_FAILED");
  assert(providerUrl.includes("margin=0"), "QR_PROVIDER_MARGIN_FAILED");
  assert(providerUrl.includes("data=https%3A%2F%2Fwww.totemv.com%2Fsalon%2Fprod-test"), "QR_PROVIDER_PAYLOAD_FAILED");

  console.log("ENTRY_QR_PROVIDER_TEST: OK");
})();
