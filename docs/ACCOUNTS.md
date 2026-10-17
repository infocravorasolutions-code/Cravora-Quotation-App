# How Accounts works

This is the guide for using Accounts in the quotation and tax invoice app. It explains how a quotation or a bill becomes money a client owes, how a payment reaches cash or bank, and how outstanding balances are calculated.

Accounts does not keep a second set of invoices. Quotations, bills, invoices, payments, and receipts stay the documents they already are. Accounts reads those records and adds the company books: cash, bank, expenses, supplier bills, partner reimbursements, and statement imports.

One company uses these books. INR and USD are never added together and are never converted.

## The four amounts that must stay separate

| What you are looking at | What it means | What it is not |
| --- | --- | --- |
| Clients owe us | Issued invoices that still have a balance | A saved quotation, a saved bill, or cash already in the bank |
| Cash and bank now | Money sitting in a company cash box or bank account | Money a client still owes |
| Owed to suppliers | Supplier bills not yet paid from a company account | A company expense that was only written down and not yet paid |
| Owed to partners | Company expenses a partner paid personally, minus what the company has paid back | A second expense |

A saved quotation or bill is a document. It becomes money the client owes only after **Create invoice**. An issued invoice is money the client owes. It becomes cash only when a payment is recorded into a cash or bank account.

Received and spent figures are not profit.

## Document names

| Prefix | Document | Counts as money owed? |
| --- | --- | --- |
| `QTN-YYYY-NNN` | Quotation | No, until it is accepted and you create an invoice |
| `BILL-YYYY-NNN` | Bill prepared in the wizard | No, until the bill is finished and you create an invoice |
| `INV-YYYY-NNN` | Tax invoice | Yes, once it is issued and a balance remains |
| `RCP-YYYY-NNN` | Receipt for a recorded payment | No. It confirms a payment that was already recorded |
| `EXP-YYYY-NNN` | Company expense | Only the unpaid balance, and only when the company has not paid it yet |
| `VBL-YYYY-NNN` | Supplier bill | Yes, until it is paid or voided |
| `LED-YYYY-NNN` | One row in the cash and bank register | It moves cash, or it is a memo that does not move cash |

The word **Billing** on a wizard document is the bill you send before it is a tax invoice. The tax invoice is the `INV-` record.

On screen, an issued invoice is labelled **Due**. Stored status `issued` means the invoice is issued and nothing has been paid yet.

## Who can change the books

An **admin** or an **accounts** user can record payments, expenses, transfers, and statement lines. A **viewer** can open the screens and cannot post. Both people share this one company. No ownership split is stored.

Settings, for an admin, can add the second partner as an accounts user.

## How a quotation becomes an invoice

1. Save the quotation. It can stay a draft. A draft is not money owed.
2. Issue it when it is ready to send. Issuing stores a snapshot. Later edits do not change that snapshot. Reprint and the public page use the snapshot.
3. The client accepts it on the public link, or you mark it accepted.
4. On Quotations, choose **Create invoice**.

The server then:

- Refuses a draft, a sent quotation that is not accepted, a rejected quotation, and an expired quotation.
- If an invoice for that quotation already exists, returns that invoice and does not create another.
- Recalculates the total on the server. The amount typed in the browser is not trusted.
- Issues the invoice in the same step. Status becomes issued. The grand total includes GST.
- Uses the quotation’s valid-until date as the due date when that date was sent. Otherwise the due date is 15 days from today.
- Marks the quotation **Invoice created**.

Saving a draft, clicking Next, or downloading the PDF does not create an invoice. Old quotations are not converted in bulk.

## How a finished bill becomes an invoice

A bill follows the same wizard as a quotation. Finish it so its status is **final**. On Quotations it is labelled **Bill**, and the main action is **Create invoice**.

The same rules apply: one invoice, server totals, issued immediately. The bill’s payment-due date is used when the bill has one. A draft bill cannot be converted.

Example already in Quotations: **BILL-2026-27** for DR ENTERPRISE.

| Line | Calculation | Amount |
| --- | --- | --- |
| Auto matic Attedance | 30 × 700 | 21,000 |
| App Release on the Playstore | 9 × 1,000 | 9,000 |
| Subtotal | | 30,000 |
| GST, intra, 18% | CGST 2,700 + SGST 2,700 | 5,400 |
| Grand total | | **35,400** |
| Due on the bill | | 30 Nov 2026 |

Until someone clicks **Create invoice** on that row, Home, Invoices, and Money to receive stay at zero for this bill. The PDF is the bill. It is not yet the tax invoice and it is not cash received.

After **Create invoice**:

- One invoice exists, for example `INV-2026-001`, status Due.
- Clients owe us increases by ₹35,400.
- Cash and bank does not change.
- The bill’s quotation status becomes Invoice created. Clicking **Create invoice** again opens the same invoice.

## How a payment is recorded

Open the invoice. Enter the amount and choose the cash or bank account that received it. Methods are cash, bank transfer, UPI, cheque, card, or other.

The server checks all of the following before it saves:

- The invoice is issued. A draft or cancelled invoice cannot be paid.
- The amount is greater than zero and has at most two decimal places.
- The amount is not above the balance still due. The balance is recalculated on the server from recorded payments.
- A cash or bank account is selected. If none exists, the form links to Cash & bank and does not post.
- The account is active and uses the same currency as the invoice.

Then:

- The invoice’s amount paid increases and the balance falls.
- Status becomes **Partially paid** or **Paid**.
- One ledger row, kind `client_receipt`, adds the same amount to that cash or bank account.
- A receipt can be created from that payment. Creating the receipt again returns the original receipt.

A payment must be money that was actually received. Do not record a payment because the invoice was sent, because the client promised to pay, or because the PDF was downloaded.

### Partial payment example

Invoice total ₹35,400. The client pays ₹20,000 into the company bank.

| Record | Result |
| --- | --- |
| Invoice | Paid ₹20,000, still due ₹15,400, status Partially paid |
| Clients owe us | ₹15,400 |
| Cash and bank | +₹20,000 |
| Received this month | +₹20,000, if the payment date is inside the selected dates |

A second payment of ₹15,400 brings the balance to zero and the status to Paid. A payment of ₹15,401 is rejected.

### What does not count as received

- Transferring money between the company’s own cash and bank accounts.
- Applying an advance that was already counted when the advance was received.
- A reversed payment.
- An invoice that is only issued and not yet paid.

## Advances

An advance is cash the client paid before it is tied to an invoice. Record it on Money to receive, against that client and a cash or bank account.

- Cash and bank increases when the advance is received.
- Received this month includes it.
- Clients owe us does not fall yet.
- The advance reduces an invoice only when you apply it to that invoice.
- The client, the currency, and the remaining invoice balance must match.
- Applying it does not add the cash a second time. The cash moved when the advance arrived.
- A receipt can still be made for the applied amount.

## Collections

Income & collections lists issued invoices and the payments recorded on them. Drafts and cancelled invoices are left out.

You can store a follow-up date, the next follow-up date, and a collection note. Those fields do not change the balance. The reminder email uses the address stored on the invoice. It does not record a payment.

Overdue means an issued or partially paid invoice whose due date has passed and whose balance is still above zero.

## How outstanding balances are calculated

For one invoice:

```text
balance due = grand total − recorded payments that have not been reversed
```

The grand total is GST-inclusive:

```text
line total   = hours × rate
subtotal     = sum of line totals
discount     = discount percent × subtotal
GST          = rate × (subtotal − discount)
grand total  = subtotal − discount + GST
```

Intra-state GST is split into CGST and SGST. Inter-state GST is IGST. Rates are 0, 5, 12, 18, or 28.

Clients owe us is the sum of `balance due` on invoices that are not draft and not cancelled. INR and USD are separate totals.

Overdue is the part of that sum whose due date has passed.

A quotation total, a bill total, and a draft invoice are excluded.

## Money to pay

Money to pay has three lists. They are not mixed into one balance.

### Company expense

Use this when the company buys something and will pay, or has paid, from company cash or bank.

- Recording the expense does not remove cash by itself.
- Cash falls only when you enter **Pay now** or a later payment, and you choose the company account.
- The unpaid balance is “open expenses” on the overview. It is not the supplier-bill total.

### Supplier bill

Use this for a bill from a supplier. It stays separate from an expense. Paying it needs the supplier’s bill, the same supplier, and a company account. The amount cannot exceed the balance due. That payment is what **Owed to suppliers** uses.

### Partner-paid expense

Use this when a partner pays a company cost from personal money.

- It is one company expense.
- No company account is reduced.
- The company now owes that partner the expense amount.
- Paying the partner back is **Reimburse a partner**. That is cash out of a company account. It is not a second expense and it is not counted in Spent this month.
- A partial reimbursement leaves the remainder owed to that partner.

Example: a partner pays a ₹2,000 domain renewal.

| Step | Company expense rows | Cash | Owed to that partner |
| --- | --- | --- | --- |
| Record it as paid by the partner | 1 expense of ₹2,000 | unchanged | ₹2,000 |
| Reimburse ₹500 | still 1 expense | −₹500 | ₹1,500 |
| Reimburse the remaining ₹1,500 | still 1 expense | −₹1,500 | ₹0 |

A reimbursement larger than the remainder is rejected. Paying that same expense again through **Pay an open expense** is rejected.

Description, category, reference, notes, and the attachment can be corrected. The correction is written to the audit log. Amount, payment source, and partner are not overwritten. Reverse the entry and record the right one.

## Cash and bank

Create a cash or bank account before you record money in or out. Each account has one currency. An opening balance is a starting balance, not income.

| Action | Cash and bank | Clients owe us | Spent | Received |
| --- | --- | --- | --- | --- |
| Client payment into an account | Up | Down | No | Yes |
| Advance received | Up | No | No | Yes |
| Advance applied to an invoice | No | Down | No | No, already counted |
| Expense or supplier payment | Down | No | Yes | No |
| Partner reimbursement | Down | No | No | No |
| Transfer between two company accounts | One down, one up, same currency | No | No | No |
| Balance adjustment | Up or down | No | No | No |
| Opening balance | Sets the start | No | No | No |

A transfer must use two different active accounts of the same currency. An adjustment needs a reason of at least three characters.

If a row was posted by mistake, undo it from the register. The original row stays, and a reversal offsets it. Undo the allocations on an advance before undoing the advance. Undo payments before voiding an expense or supplier bill that has been paid.

## Statement import

On Statements, choose the company account and the period, then upload a bank PDF, CSV, or Excel file. The PDF must be a text statement from the bank, not a scanned photo. Nothing posts until you confirm each line.

The preview shows date, description, reference, debit, credit, and running balance. Nothing is posted by the upload.

Each line is compared with the register:

- Same account, and the same reference when the line has one.
- Otherwise the same account, date, amount, and direction.
- One existing row: **matched**. Confirming it only links the line.
- More than one possible row, or the same file line was already confirmed: **potential duplicate**. Link it. Do not post it again.
- No existing row: **unmatched**. It stays unposted until you say what it is.

A bank debit is not automatically an expense. A bank credit is not automatically client income. When you confirm a new line, mark it as an expense, a transfer, owner money, a tax payment, or another adjustment. The same file uploaded again returns the original batch and does not post twice.

Opening balance, closing balance, and their difference are stored when you enter them. **Statements to review** counts lines that are unmatched, possible duplicates, or left for review.

## What the overview numbers use

Home and Accounts → Overview show eight figures. The dates at the top apply only to received, spent, and recent activity. They do not rewrite cash, what clients owe, or what the company owes.

| Card | Source |
| --- | --- |
| Cash and bank now | Current balance of every cash and bank account |
| Received this month | Invoice payments plus advances whose date is in the range. Transfers excluded. An applied advance is not added again |
| Spent this month | Expense payments and supplier-bill payments in the range. Transfers and partner reimbursements excluded |
| Clients owe us | Balance due on issued invoices, including partially paid ones |
| Overdue | The overdue part of that balance |
| Owed to suppliers | Unpaid supplier bills |
| Owed to partners | Partner-paid expenses minus reimbursements, per partner |
| Statements to review | Statement lines not yet confirmed |

Reports adds partner balances, category totals, and cash movement. Each can be exported as CSV. Invoice totals on those reports stay GST-inclusive.

## Checks that prevent bad records

| Mistake | What the app does |
| --- | --- |
| Create an invoice from a draft | Refused |
| Create a second invoice for the same quotation or bill | Returns the invoice that already exists |
| Trust the total calculated in the browser | The server recalculates on issue, conversion, and payment |
| Record a payment with no cash or bank account | Refused. The form links to Cash & bank |
| Record more than the invoice, expense, supplier bill, or partner remainder | Refused |
| Record a payment on a draft or cancelled invoice | Refused |
| Mix INR and USD on one payment or transfer | Refused |
| Apply an advance to another client | Refused |
| Count an applied advance as new cash | The allocation does not move cash |
| Pay a partner back by adding another expense | Use Reimburse a partner. A second payment of that expense is refused |
| Change a posted amount by editing the row | Amount, source, and partner must be reversed, then entered again |
| Import a scanned photo PDF with no text | Refused. Use a bank text PDF, or CSV / Excel |
| Upload the same statement again | The original batch is returned and nothing is posted again |
| Treat a statement debit as an expense before you confirm it | Nothing is posted until you confirm and choose the kind |
| Let a viewer post | Refused |
| Submit twice because the request was retried | The same idempotency key returns the original record |

Editing a client does not rewrite the client details stored on old quotations or invoices. Editing a supplier does not rewrite the supplier name stored on bills already posted.

## Correct order of work

1. Add at least one cash account and one bank account, with the real opening balance, before recording payments.
2. Finish the quotation and get it accepted, or finish the bill.
3. Click **Create invoice** once. Open the invoice and confirm the GST-inclusive total and due date.
4. When money actually arrives, record the payment against that invoice and the account that received it. Then create the receipt.
5. For money the company spends, choose an expense, a supplier bill, or a partner-paid expense. Pay from a company account only when the company actually paid.
6. Import a statement to check the bank, then confirm each line. Do not confirm a line you have not identified.
7. Use Overview for the eight figures, and Reports when you need a list or a CSV.

Do not type a sample payment to see the dashboard move. A payment is a real receipt of money. Do not convert old bills in bulk. Convert the bill you are ready to collect.
