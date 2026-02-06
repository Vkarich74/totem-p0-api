import { TotemSDK } from "./totem-sdk.js";

const sdk = new TotemSDK({
  baseUrl: "https://totem-p0-api-production.up.railway.app"
});

console.log("health:", await sdk.health());

const booking = await sdk.createBooking({
  salon_id: "s1",
  master_slug: "test-master",
  service_id: "srv1",
  date: "2026-01-27",
  start_time: "12:00",
  end_time: "13:00",
  client: { name: "Alex" }
});

console.log("booking:", booking);

const intent = await sdk.createPaymentIntent({
  request_id: booking.request_id,
  provider: "test",
  amount: booking.price
});

console.log("intent:", intent);
