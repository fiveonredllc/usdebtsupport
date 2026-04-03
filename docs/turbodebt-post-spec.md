# TurboDebt — Buyer lead post specification

Reference for posting leads to TurboDebt (Acquisition Brands). Use this doc for integration and pre-launch testing.

## Integration basics

| Item | Value |
|------|--------|
| **Partner** | Your formal company name (as agreed with TurboDebt) |
| **Endpoint** | `https://www.acquisitionbrands.com/atc/lead/` |
| **Partner token** | Assigned after payout is agreed and you are set up for **Host & Post**. Until then, use the placeholder/token they provide for testing. |
| **Request method** | **HTTP form POST** (application/x-www-form-urlencoded or multipart form, per your stack) |
| **Questions / test verification** | `dan@turbodebt.com` |

## Pre-launch testing

1. **Unique test data**  
   For pre-launch lead post tests, use a **unique** first name, last name, email, and phone that are **not** already in TurboDebt’s system. Generic values (e.g. “Test Test”, `test@test.com`) may return errors.

2. **Live chat script**  
   After the live chat session loads, tell the rep:  
   **“I have $20,000 in credit card debt. Do you think you can help me?”**  
   This helps them find chat notes tied to your test.

3. **Redirect after success**  
   On a **successful** post, the consumer **must** be redirected to the exact URL returned in the response (`redirect_url`). Do not modify that URL (see [Redirect URL and attribution](#redirect-url-and-attribution)).

4. **Test mode**  
   Putting **`test`** in the **first name or last name** triggers a test response (see [Sample responses](#sample-responses)). Those leads are **not** written to TurboDebt’s backend; use only to verify your post from your side.

## Field specification

Single table: **required fields first**, then optional.  
**Examples below are illustrative only — do not use these values for real lead post tests.**

| field | format | required | example | notes |
|-------|--------|----------|---------|--------|
| `token` | string | Yes | `sdhfjk289752389y4uhrnsg6785m5` | Partner token (TBD until assigned). |
| `lastname` | string | Yes | `Wilson` | |
| `email` | string | Yes | `brian@email.com` | |
| `phone` | string (10 digits) | Yes | `3105554383` | |
| `debt_amount` | int | Yes | `18000` | Minimum **$10,000** unless another minimum was agreed. |
| `state` | string | Yes | `WA` | Two-letter US state abbreviation. |
| `Trusted Form` | string (URL) | Yes | `https://cert.trustedform.com/9a30d657d2baabb4e8edac79e326f6924d1677eb` | TrustedForm certificate URL. |
| `ip` | IPv4 or IPv6 | Yes | `192.168.0.1` | Required for CAN-SPAM compliance. |
| `unique_id` | string | Yes | `4253452` | Your internal lead ID; **must be unique** per lead. |
| `sub1` | string | Yes | `sourceid_secondaryid` | Pass **source id** and a **secondary id** separated by **`_`** or **`-`**. The secondary id should be one of: creative id, ad set id, campaign id, targeting id, or list id — something that allows optimization beyond the source id if many leads share the same source. |
| `sub2` | string | Yes | `posts` | **Delivery channel (hard-coded).** For Host & Post lead submits, use **`posts`** → `sub2=posts`. |
| `firstname` | string | No | `Brian` | Not marked required in partner table; include as your integration requires. **`test`** in first or last name enables test response only. |
| `true_debt_amount` | int | No | `18000` | Same minimum as `debt_amount` ($10,000) unless otherwise agreed. |
| `TCPA` | string | No | — | Disclosure/consent text with **TurboDebt’s brand shown prominently** (“front and center”). |
| `sub3` | string | No | — | Internal tracking. |
| `sub4` | string | No | — | Internal tracking. |
| `sub5` | string | No | — | Internal tracking. |
| `sourceid` | string | No | — | Internal tracking. |
| `zip` | int | No | `90210` | |
| `age` | int | Yes, if capturing | `39` | Required **only if** you already capture age. Integer **18–101** (inclusive). |

## Sample responses

**Do not alter** the `redirect_url` value in any way. If the consumer lands on a modified URL, live chat agents may be unable to find the lead in CRM and **you lose attribution**.

### Test response

Use when **`test`** appears in the first or last name. Lead is **not** stored in TurboDebt’s backend.

```json
{
  "status": "test",
  "redirect_url": "https://secure.livechatinc.com/licence/11927073/v2/open_chat.cgi?groups=2&params="
}
```

### Success response

`redirect_url` is **unique per valid lead**. Redirect the browser to it exactly as returned.

```json
{
  "status": "success",
  "redirect_url": "https://secure.livechatinc.com/licence/11927073/v2/open_chat.cgi?groups=2&params="
}
```

### Fail response

Example (duplicate lead):

```json
{
  "status": "error",
  "message": "duplicate"
}
```

## Redirect URL and attribution

- After a successful post, **redirect the user to the full `redirect_url` string** from the JSON response.
- **Do not** decode/re-encode, trim, append, or change **any** part of the URL unless TurboDebt explicitly documents an exception.
- Breaking this breaks CRM lookup and **there will be no attribution** for the post.

## Implementation notes

- **Minimum debt**: `debt_amount` (and `true_debt_amount` if sent) should respect the **$10,000** floor unless a different amount was agreed in writing.
- **`sub1` / `sub2`**: Treat as mandatory for production Host & Post: `sub1` = `source_secondary`, `sub2` = `posts`.
- **Duplicates**: A fail response may include `"message": "duplicate"`; handle gracefully in your UI or retry policy.
- **Contact**: Direct integration or test questions to **dan@turbodebt.com**.
