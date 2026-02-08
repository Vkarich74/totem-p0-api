import subprocess
import json
from datetime import datetime

LOG_FILE = f"financial_core_test_log_{datetime.now().strftime('%Y%m%d_%H%M%S')}.txt"

def log(msg):
    print(msg)
    with open(LOG_FILE, "a", encoding="utf-8") as f:
        f.write(msg + "\n")

def run_node(code, label):
    log(f"\n=== {label} ===")
    p = subprocess.run(
        ["node", "-e", code],
        capture_output=True,
        text=True
    )
    log(p.stdout)
    if p.stderr:
        log("STDERR:")
        log(p.stderr)
    return p.returncode == 0

log("FINANCIAL CORE FULL TEST START")

# 1. Create wallets
run_node("""
import { getOrCreateWallet, getWalletBalance } from './services/wallet/wallet.service.js';
global.systemWallet = await getOrCreateWallet({ ownerType: 'system', ownerId: 1 });
global.masterWallet = await getOrCreateWallet({ ownerType: 'master', ownerId: 100 });
console.log('systemWallet=', systemWallet);
console.log('masterWallet=', masterWallet);
""", "CREATE WALLETS")

# 2. Create + pay payment
run_node("""
import { createPayment, markPaymentPaid } from './services/payment/payment.service.js';
global.paymentId = await createPayment({
  clientRef: 'test-client',
  targetWalletId: global.masterWallet,
  amountCents: 10000
});
await markPaymentPaid({ paymentId: global.paymentId });
console.log('paymentId=', global.paymentId);
""", "PAYMENT PAID")

# 3. Check balance
run_node("""
import { getWalletBalance } from './services/wallet/wallet.service.js';
const b = await getWalletBalance(global.masterWallet);
console.log('master balance after payment=', b);
""", "CHECK BALANCE AFTER PAYMENT")

# 4. Fee engine
run_node("""
import { applyFees } from './services/fee/fee.engine.js';
const res = applyFees({
  amountCents: 10000,
  rules: [{ id: 1, percent: 10, fixed_cents: 500 }]
});
console.log(JSON.stringify(res, null, 2));
""", "FEE ENGINE")

# 5. Payout request
run_node("""
import { requestPayout } from './services/payout/payout.service.js';
global.payoutId = await requestPayout({
  walletId: global.masterWallet,
  amountCents: 3000
});
console.log('payoutId=', global.payoutId);
""", "PAYOUT REQUEST")

# 6. Balance after payout
run_node("""
import { getWalletBalance } from './services/wallet/wallet.service.js';
const b = await getWalletBalance(global.masterWallet);
console.log('master balance after payout=', b);
""", "CHECK BALANCE AFTER PAYOUT")

# 7. Service invoice
run_node("""
import { createServiceInvoice } from './services/invoice/service-invoice.service.js';
await createServiceInvoice({
  sourceWalletId: global.masterWallet,
  systemWalletId: global.systemWallet,
  description: 'platform fee',
  amountCents: 1000
});
console.log('service invoice created');
""", "SERVICE INVOICE")

# 8. Final balances
run_node("""
import { getWalletBalance } from './services/wallet/wallet.service.js';
console.log('master final balance=', await getWalletBalance(global.masterWallet));
console.log('system final balance=', await getWalletBalance(global.systemWallet));
""", "FINAL BALANCES")

log("FINANCIAL CORE FULL TEST END")
log("RESULT: CHECK LOG MANUALLY")
