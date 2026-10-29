# Test results

Generated 2026-10-29T21:01:50.337Z · source mode: **live** · scoring: **vision model**

**Run settings:** `MAX_ROUNDS=2`, `CANDIDATES_PER_ROUND=25` (the code defaults are 4 and 40). I lowered them to stay inside a free Apify plan
(about $3.40 for these 7 searches). With the defaults each search fetches more candidates, so shortfalls should be smaller, but I have not
measured that. Vision scoring: Gemini (`gemini-3.1-flash-lite`), match threshold 60, weak 40-59. Instagram and Meta via Apify actors.
"Matches" are strong matches (score >= 60) out of a target of 20; "weak" are marked low-confidence videos used to top up a shortfall.

| Product | Run | IG matches / weak | Meta matches / weak | Fetched (IG/Meta) | Dups removed | Seen removed | Below threshold | Time | New vs previous run |
|---|---|---|---|---|---|---|---|---|---|
| oversized graphic tee | 1 | 37 / 0 | 20 / 0 | 50/37 | 6 | 0 | 13 | 143s | — |
| oversized graphic tee | 2 | 13 / 3 | 18 / 2 | 100/48 | 19 | 4 | 60 | 95s | 36 new, 0 repeated |
| protein dark chocolate | 1 | 10 / 10 | 0 / 1 | 100/26 | 3 | 0 | 79 | 151s | — |
| protein dark chocolate | 2 | 15 / 4 | 2 / 0 | 100/18 | 0 | 2 | 69 | 110s | 21 new, 0 repeated |
| insulated stainless steel tumbler | 1 | 9 / 11 | 4 / 13 | 100/41 | 19 | 0 | 57 | 163s | — |
| www.allbirds.com/products/mens-tree-runners | 1 | 2 / 8 | 3 / 0 | 100/9 | 1 | 0 | 95 | 99s | — |
| www.glossier.com/products/balm-dotcom | 1 | 1 / 3 | 0 / 0 | 100/21 | 10 | 0 | 107 | 135s | — |

## How to read these results

- **20 + 20 was fully met once** (oversized graphic tee, run 1: 37 Instagram, 20 Meta). Everything else fell short on at least one source, and the dashboard flagged each shortfall.
- **Why the shortfalls:** (1) Meta *video* ads for niche products are scarce: protein chocolate returned 26 ads and only 1 was a usable match; (2) with a product photo the scorer is strict, so a different colourway or an unclear variant scores 40-50 (Allbirds, Glossier: 95 and 107 videos fell below the threshold); (3) the reduced search depth noted above.
- **Photo vs keyword:** with a product link the scorer separates the exact item (Allbirds same colourway: 87-89) from a different model or colourway (45). Keyword-only searches judge fit to the description, so scores bunch in the 80s-90s for generic products.
- **De-duplication works:** the two repeat searches returned **0 repeated videos** (36 new for the tee, 21 new for the chocolate). Repeats are noticeably weaker (tee: 13 Instagram strong matches vs 37 on the first run) because the best matches were already shown.
- **Failure modes worth knowing:** the Glossier run found only 1 strong match from 100 Instagram posts; most were multi-product shots or showed a variant the model could not confirm. A single thumbnail is a limited signal (see README, known limitations).

## Example good and bad matches (run 1)

### oversized graphic tee

Detected: oversized graphic t-shirt · colours: — · engine: text

Best matches:
- **98** [instagram] https://www.instagram.com/p/Dd1BLFtIq6m/ — A collage showing multiple examples of oversized graphic t-shirts worn by a woman.
- **95** [instagram] https://www.instagram.com/p/Db03xntorCG/ — Woman wearing an oversized graphic t-shirt, clearly the focus of the video.

Worst kept / borderline:
- **68** [meta] https://www.facebook.com/ads/library/?id=3973630816107861 — Man wearing a black graphic t-shirt under a long-sleeved shirt.
- **66** [meta] https://www.facebook.com/ads/library/?id=2614077575681082 — Woman wearing a graphic t-shirt under a cardigan.

### protein dark chocolate

Detected: protein-infused dark chocolate bar · colours: dark brown · engine: text

Best matches:
- **96** [instagram] https://www.instagram.com/p/DX7NRG6gBh2/ — Multiple protein dark chocolate bars are clearly displayed and are the focus of the image.
- **93** [instagram] https://www.instagram.com/p/Cx3N--mAcE9/ — A woman holding a protein-infused dark chocolate bar, clearly visible and the focus of the image.

Worst kept / borderline:
- **40** [instagram] https://www.instagram.com/p/DZ-AA-Hg6lk/ — Shows chocolate being poured over a dessert, not a protein chocolate bar.
- **40** [instagram] https://www.instagram.com/p/C7e7uoNgDDK/ — Shows chocolate brownies, not a protein-infused dark chocolate bar.

### insulated stainless steel tumbler

Detected: insulated stainless steel tumbler · colours: stainless steel silver · engine: text

Best matches:
- **86** [instagram] https://www.instagram.com/p/Ck8zhvRg1oa/ — shows a black insulated stainless steel tumbler with custom text.
- **86** [meta] https://www.facebook.com/ads/library/?id=1700521284775389 — Stainless steel silver insulated tumbler with baseball graphic, matches the material and colour description.

Worst kept / borderline:
- **43** [meta] https://www.facebook.com/ads/library/?id=2031571647480846 — Person holding a white tumbler, but it is not clearly stainless steel silver.
- **41** [meta] https://www.facebook.com/ads/library/?id=2497606294010464 — Shows a white tumbler, not stainless steel silver.

### www.allbirds.com/products/mens-tree-runners

Detected: men's knit sneakers · colours: black, white · engine: vision

Best matches:
- **89** [meta] https://www.facebook.com/ads/library/?id=28899419133001945 — Matches the reference shoe design, colour, and sole shape perfectly.
- **87** [instagram] https://www.instagram.com/p/DNUAzdVyjEL/ — The image shows the exact Allbirds Tree Runner shoe from the reference.

Worst kept / borderline:
- **45** [instagram] https://www.instagram.com/p/C3VD1ChrYFA/ — Shows a grey sneaker, but it is a different model and design than the reference.
- **45** [instagram] https://www.instagram.com/p/CjybL-xD1JE/ — Shows a different Allbirds model in a different colourway.

### www.glossier.com/products/balm-dotcom

Detected: tinted lip balm · colours: various · engine: vision

Best matches:
- **75** [instagram] https://www.instagram.com/p/Cd6DDuJNawF/ — Shows a Glossier Balm Dotcom tube in the lavender variety.
- **50** [instagram] https://www.instagram.com/p/DEVbhalpvqp/ — Shows multiple Glossier Balm Dotcom tubes, not a single specific product.

Worst kept / borderline:
- **48** [instagram] https://www.instagram.com/p/CJXY1AyhJZ_/ — Shows a Glossier Balm Dotcom tube, but the specific variety is not clear.
- **41** [instagram] https://www.instagram.com/p/C9qecVmyut9/ — Shows various Glossier products on a shelf, not a specific product.
