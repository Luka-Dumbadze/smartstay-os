# Multi-channel overbooking: synthetic Mom Test interview

**SYNTHETIC ROLEPLAY — no real hotelier, guest records, observed losses, or consent.**
Both logical agents are pinned to `gpt-6-astra` in separate Codex sessions and working directories.
The respondent's private preparation was not supplied to the interviewer. Only delivered dialogue is below;
verbatim preparation, draft/retry outputs, prompts, events and execution metadata are retained in `overbooking_001/calls/`.

**Timing:** 12 question–answer exchanges (24 speaker messages) allocated across the seven protocol stages.
Minute ranges represent the simulated 40-minute agenda, not measured human interview duration.
The 28-room hotel, cancellation rate, booking timing, charges and settlement conversions are fictional scenario details. Claimed Clause 6 and EUR 120 fee are not authenticated policy. No real guest was interviewed or relocated.

## Turn 01 — Operating context — simulated minutes 0–5

### Interviewer

May I take notes? You can skip any question; please hide private details in any records you choose to show. I’ll ask separately before recording or using an attributable quotation.

What are your responsibilities for room availability across booking channels and direct sales?

### Respondent

Yes, you can take notes for this fictional rehearsal. Any records I refer to will use fictional identifiers.

I’m the general manager, and I own the decisions about how many rooms we offer, on which channels, and when we close availability. We have 28 rooms, and Booking.com, Expedia and Direct all draw from the same room inventory.

Our Channel Operations colleague maintains the room mappings, checks availability updates and reconciles differences between the booking channels and our property management system. Front Desk and the Night Auditor handle arrivals and direct enquiries. For a telephone or walk-in booking, they must enter the reservation into the system before confirming it. Website bookings also use that shared inventory.

The important boundary is that a change in our system does not instantly reserve or remove a room inside both OTAs. I’m responsible for choosing how much exposure we accept near sellout, including whether to leave several channels open for the last room. If that creates a conflict, the desk escalates it, and I own the relocation decision and expenditure. I wouldn’t put responsibility for that commercial policy on the night auditor.

## Turn 02 — Last difficult episode — simulated minutes 5–8

### Interviewer

What was the most recent booking conflict or guest relocation, if any? If none comes to mind, we can walk through the last completed booking.

### Respondent

The most recent was for Saturday, 12 September, during a busy harvest weekend. We had one room left, with Booking.com, Expedia and Direct still open against the same inventory.

In our fictional records, Booking.com confirmed a one-night reservation, then Expedia confirmed another about 65 seconds later. That happened between two stock-update jobs roughly two minutes apart. We ended up with 29 commitments for 28 rooms. Direct didn’t take another booking.

I had chosen to keep the channels open near sellout, partly because we’d seen substantial cancellations on free-cancellation bookings. That was my risk decision; we hadn’t deliberately authorized selling a 29th room. The timing supports an inventory race, although missing distribution records mean I can’t rule out a mapping or manual-edit contribution.

We accommodated the Expedia guest and arranged an equivalent alternative for the Booking.com guest for one night, with transport and no additional payment from the guest. The stay finished on 13 September.

The competitor cost USD 260 and the taxi USD 30. A fictional invoice also included a claimed EUR 120 handling item. All three were subsequently deducted from our payout, but we disputed the handling item because its contractual basis wasn’t available.

## Turn 03 — Last difficult episode — simulated minutes 8–12

### Interviewer

What source timestamps support the booking order and the roughly 65-second interval, and what does each timestamp represent? If those records are available, could you show the relevant entries with private details hidden?

### Respondent

Yes. These are invented rehearsal excerpts with fictional identifiers. All times are on **12 September 2026, Asia/Tbilisi, UTC+04:00**.

| Source/event | Booking.com — F-BKG-912-A | Expedia — F-EXP-912-B |
|---|---|---|
| OTA-origin record: booking accepted as confirmed | 00:10:15 — B-ACC-01 | 00:11:20 — E-ACC-01 |
| Local callback receipt: notification reached our system | 00:10:25 — B-IN-01 | 00:11:30 — E-IN-01 |
| Local processing: reservation committed to inventory | 00:10:28 — version 8422, availability zero | 00:11:34 — version 8423, one-room deficit |

The **65 seconds comes from the two OTA acceptance timestamps**, not from when staff saw the bookings or when our system processed them.

Those acceptance records have whole-second resolution, with an assumed fictional clock uncertainty of ±5 seconds each. That puts the interval at approximately 55–75 seconds and supports the order within this scenario. Local clock checks have approximately ±2-second uncertainty.

The export ledger separately records stock-update jobs at 00:10:00 and 00:12:00. Receipt acknowledgements followed at 00:12:06 for Booking.com and 00:12:09 for Expedia. Those acknowledgements don’t establish when the rooms actually stopped being sellable.

Both listings were observed unavailable at 00:14, but that check has only minute resolution. Expedia’s outbound payload and detailed edit history are missing, so I can’t establish the exact mapping sent or exclude a manual availability edit.

## Turn 04 — Artifact walkthrough — simulated minutes 12–15

### Interviewer

What do the available stock-update records show about the inventory sent and the meaning of the receipt acknowledgements? If available, could you show the relevant entries for those two jobs?

### Respondent

The surviving ledger shows one room in the first export and an intended zero-stock update in the second. These are the exact fictional entries, using invented identifiers:

```text
FICTIONAL | 2026-09-12T00:10:00+04:00 | distribution export U-8421 | stay=2026-09-12 | local_inventory_version=8421 | available=1 | targets=Booking.com,Expedia

FICTIONAL | 2026-09-12T00:12:00+04:00 | outbound stock job U-8423 | local_version=8423 | intended_available=0 | Booking.com request=B-OUT-02 | Expedia request=E-OUT-02

FICTIONAL | 2026-09-12T00:12:06+04:00 | acknowledgement B-ACK-02 | request=B-OUT-02 | receipt accepted | consumer sellability not established

FICTIONAL | 2026-09-12T00:12:09+04:00 | acknowledgement E-ACK-02 | request=E-OUT-02 | receipt accepted | consumer sellability not established
```

By the second job, our system had recorded 29 commitments against 28 rooms. It advertised zero availability; it retained the one-room deficit internally.

The acknowledgements establish receipt acceptance in this mock record. They don’t prove that the intended room and every associated rate plan had closed, or establish the exact time guests could no longer book.

The version numbers are local references, not proof that either OTA enforced inventory versions. Expedia’s outbound payload bodies are missing, so its ledger entry establishes what we intended to send, not the exact mapping transmitted. No first-job acknowledgement is available in these excerpts. The later 00:14 availability observation supports closure for the search checked, with minute-level precision.

## Turn 05 — Artifact walkthrough — simulated minutes 15–18

### Interviewer

How was the relocation decision made in this case? If a record of that decision exists, could you show it with private details hidden?

### Respondent

The night auditor read the over-capacity exception at 00:19 and escalated it to me. We had no internal room available, so I took responsibility for arranging the alternative and approving the expenditure. We accommodated the Expedia guest and relocated the Booking.com guest for one night.

The available fictional recovery entries are:

```text
FICTIONAL | 2026-09-12 00:23 +04:00 | GM notified; no internal room available.

FICTIONAL | 2026-09-12 09:10 +04:00 | alternative double confirmed at fictional competitor for one night, USD 260.

FICTIONAL | 2026-09-12 09:25 +04:00 | fictional guest accepts alternative and transport without additional payment.

FICTIONAL | 2026-09-13 11:00 +04:00 | relocated stay completed.
```

Our fictional comparison sheet records a double room with a private bathroom and breakfast, matching those basic booking requirements. Transport cost USD 30.

There’s a gap in the decision record: these entries document escalation, the alternative and acceptance, but they don’t explain why we selected the Booking.com reservation for relocation despite its earlier acceptance. I can’t supply a documented selection rule or reconstruct that reasoning from timestamps alone.

The guest’s accommodation was resolved, but that doesn’t settle the separate question of whether every subsequently invoiced charge had a contractual basis.

## Turn 06 — Artifact walkthrough — simulated minutes 18–20

### Interviewer

What supports the claimed EUR 120 handling charge? If available, could you show the relocation invoice and any terms cited for that item, with private details hidden?

### Respondent

The fictional invoice supports that EUR 120 was charged. It doesn’t establish that the charge was contractually justified. Here is the relevant record:

```text
FICTIONAL INVOICE F-REL-0914
Issued and received: 14 September 2026
Case: FICTIONAL-INC-20260912-01
Debtor: Fictional Vineyard Court

Alternative accommodation, ONE night, 12–13 September
USD 260.00 → GEL 702.00

Relocation taxi, 12 September
USD 30.00 → GEL 81.00

Claimed handling item
EUR 120.00 → GEL 360.00

TOTAL: GEL 1,143.00
```

Those conversions use the explicitly fictional transaction schedule FX-F12: USD 1 equals GEL 2.70 and EUR 1 equals GEL 3.00. They are not real market rates.

I remember people referring to “Clause 6,” but I cannot show an applicable signed clause establishing this item. The available invoice doesn’t identify a specific contractual provision for it.

The public terms check you supplied places relocation obligations in clause 2.6.1 and indemnification matters in section 6. It found neither “120” nor “handling fee” in that retrieved text. That does not establish a universal tariff or resolve this particular charge’s legal basis.

The full GEL 1,143 was offset against our fictional payout on 18 September. We disputed the GEL 360 handling component; no credit had been issued by 23 September. So it was deducted, but its contractual basis remains unresolved.

## Turn 07 — Frequency and loss — simulated minutes 20–24

### Interviewer

How does the GEL 1,143 invoice reconcile with the payout deduction, bank receipts and any original guest funds? If those records are available, could you show the linked entries with their recorded currencies and conversions, keeping private details hidden?

### Respondent

The invoice and deduction are the same GEL 1,143 charge, counted once. These linked entries are all fictional.

The invoice uses **FX-F12**, an invented transaction schedule: USD 1 = GEL 2.70; EUR 1 = GEL 3.00.

```text
F-REL-0914 | 14 September 2026
Accommodation: USD 260 = GEL 702
Taxi:          USD  30 = GEL  81
Handling:      EUR 120 = GEL 360
Total:                  GEL 1,143
```

The OTA paid the competitor and taxi; we made no separate supplier payment.

```text
F-BPAY-0918 | 18 September 2026 | All entries GEL
Completed settlement period: 1–15 September

Other reservation receipts                  +6,000
Other commissions                             -900
F-BKG-912-A original collection                +540
F-BKG-912-A guest refund                       -540
Original commission                            -81
Commission reversal credit                     +81
F-REL-0914 offset                            -1,143
NET TRANSFER                                 3,957

F-BANK-0918 | Value date 18 September
Received GEL 3,957 | Reference F-BPAY-0918
```

The original guest paid USD 200 on 12 September and received a full USD 200 refund on 13 September—GEL 540 each under FX-F12. We never received that money in cash.

```text
F-EPAY-0920 | 20 September | Expedia booking
Gross:      USD 200 = GEL 540
Commission: USD  32 = GEL 86.40
Refund: zero
Net: GEL 453.60

F-BANK-0921 | Value date 21 September
Received GEL 453.60 | Reference F-EPAY-0920
```

The invoice balance is zero, but GEL 360 remains disputed without a credit. Expedia’s receipt is ordinary room revenue; it does not automatically offset the relocation expense as incremental earnings.

## Turn 08 — Frequency and loss — simulated minutes 24–27

### Interviewer

For a completed period you can check, how many bookings had a conflict like this, out of how many relevant bookings? If a count record exists, could you show how bookings were included and outcomes distinguished?

### Respondent

I can describe this one conflict, but I don’t have a closed count of comparable conflicts against all relevant bookings. I wouldn’t turn one incident into a rate without that denominator.

The completed count record available is for cancellations, which answers a different question:

```text
FICTIONAL COHORT-FC-AUG26
Closed: 2 September 2026

Included:
100 unique free-cancellation reservation IDs
scheduled to arrive during August 2026,
across Booking.com, Expedia and Direct.
Date amendments retain the original reservation ID.
Unit: reservations, not room-nights.

Outcomes:
Cancelled before penalty: 38
Completed stays:           62
Unresolved or no-show:      0
```

That is the basis for my roughly 35–40% cancellation recollection. It has no separate conflict or relocation field. A completed stay also doesn’t, by itself, prove that there was no booking conflict along the way.

For September, we have the documented pair of conflicting reservations for 12 September, resulting in one relocation. We also have the following Saturday’s successful use of exclusive Direct availability, but neither record supplies a complete September booking denominator.

To answer your question properly, we would need a completed reservation register with conflicts identified separately from cancellations, and outcomes distinguishing guests accommodated here from guests relocated. That count is unavailable in this fictional dossier.

## Turn 09 — Past attempts and workarounds — simulated minutes 27–30

### Interviewer

What, if anything, changed in how you allocated room availability across channels after 12 September, and when did that change take effect?

### Respondent

We used an exclusive Direct arrangement for the remaining rooms on the following peak Saturday. It took effect on **18 September for stays on 19–20 September**.

At 26 commitments, Channel Operations closed availability on both Booking.com and Expedia. We recorded closure checks before releasing the two remaining rooms exclusively through Direct. I owned the release decision, and Front Desk used the shared property management system to confirm reservations.

The fictional control record, **CTRL-0919**, shows that Direct sold both rooms. Twenty-eight parties stayed that Saturday, with no conflicting confirmation or relocation.

That was a change from leaving several channels open against the last room. It reduced the exposure by giving the remaining availability to one sales source. It didn’t create a reservation lock across the OTAs.

I can substantiate that specific use of the control in this rehearsal. I can’t claim it had become a permanent policy for every date, or infer a prevention rate from one successful weekend. We also don’t know whether closing the OTAs cost us enquiries or changed the rates we could achieve.

## Turn 10 — Past attempts and workarounds — simulated minutes 30–33

### Interviewer

Could you walk me through the closure checks and Direct release recorded in CTRL-0919? If the record is available, could you show the entries through the two Direct confirmations?

### Respondent

I can show the summary, but I need to qualify my earlier description: CTRL-0919 does not contain a timestamped sequence of closure checks and individual Direct confirmations.

The available fictional record reads:

> **FICTIONAL CTRL-0919:** On 2026-09-18, with 26 commitments for 19 September, both OTAs were closed. Closure checks were recorded before two remaining rooms were released exclusively through Direct.

Its completed-outcome summary states:

> For 19–20 September, Direct sold both remaining rooms; 28 parties stayed, no conflicting confirmation and no relocation occurred.

So the recorded sequence is: close Booking.com and Expedia, check closure, then release the remaining two rooms through Direct. I owned the release decision; Channel Operations handled OTA closure, and Front Desk confirmed through the shared PMS.

What’s missing is the underlying detail: exact check times, which searches or rate plans were checked, supporting acknowledgements, and the two Direct reservation IDs and confirmation timestamps. I can’t show those entries or establish the interval between closure and release.

The summary supports that we used the control and had a successful completed Saturday. It does not provide a detailed technical audit of the closure or prove that every possible OTA booking path was unavailable.

## Turn 11 — Counterexample and competing cause — simulated minutes 33–37

### Interviewer

Beyond the change to exclusive Direct availability, what else, if anything, differed between 12 and 19 September that matters to comparing their outcomes? It’s fine if that’s unknown.

### Respondent

One clear difference is when we acted. For 12 September, we still had several channels open with just one room left. For 19 September, we closed the OTAs at 26 commitments, leaving two rooms to sell through Direct. So we changed both the sales source and the point at which we restricted availability.

Both were peak Saturdays, and both ended with 28 parties staying in the hotel. But that doesn’t establish equal booking pressure. On 12 September, we have two OTA acceptances about 65 seconds apart. For 19 September, we don’t have the individual Direct confirmation times or evidence that similarly simultaneous requests occurred.

We also don’t have a matched comparison of enquiry volumes, cancellations, rates, staffing or distribution-system conditions. We don’t know how much demand we missed after closing the OTAs.

I’d therefore describe 19 September as one successful use of a practical control. It shows we could fill the remaining rooms through Direct without a recorded conflict that weekend. It doesn’t isolate the control’s effect from differences in demand and timing, or establish how often it would prevent relocation.

## Turn 12 — Concrete next step — simulated minutes 37–40

### Interviewer

What, if anything, needs correcting in our reconstruction? What specific next step, if any, do you agree to now?

### Respondent

I’d tighten three points.

First, the records support two acceptances about 65 seconds apart and a two-minute interval between export jobs. They don’t prove precisely when either OTA stopped selling. The missing Expedia payload and edit history leave the mapping or manual-edit explanation unresolved.

Second, the EUR 120 handling item was invoiced and deducted in the fictional transactions, but its contractual basis remains unknown. My “Clause 6” recollection is not verification. The invoice and deduction are one expense, not two.

Third, the following Saturday was one successful use of exclusive Direct availability. We have a summary, not detailed closure and confirmation logs or a matched comparison. And the 38% figure describes cancellations in the August cohort, not a conflict rate or justification for overselling.

I also accept that we haven’t documented why the earlier Booking.com reservation was selected for relocation. That gap should stay visible.

The specific next step I agree to now is a written rehearsal case summary incorporating those corrections and listing the missing records separately. That’s the extent of the commitment: this exercise provides no real hotel access, operational trial or permission to use an attributable real-world quotation.

