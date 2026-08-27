# Star Wars: Unlimited Deck Construction Specification

## Document status

| Field | Value |
| --- | --- |
| Status | Draft 1.0 |
| Rules baseline | *Star Wars: Unlimited Comprehensive Rules*, version 8.0 |
| Rules publication date | July 8, 2026 |
| Intended consumers | Deck builder UI, deck validator, import/export tools, test suite |
| Primary subject | Constructing and validating decks before play |

This document translates the deck-construction portions of the *Star Wars: Unlimited Comprehensive Rules* version 8.0 into an implementation specification. It covers Premier, Eternal, Trilogy, Sealed, Draft, and Twin Suns deck construction.

This is a technical interpretation intended for this project. It is not a replacement for the official rules, tournament regulations, format pages, suspension lists, or rulings. When this document conflicts with an official source, the official source controls and this specification must be updated.

The key words **MUST**, **MUST NOT**, **SHOULD**, **SHOULD NOT**, and **MAY** describe implementation requirements.

## 1. Goals

The deck-building system defined here must be able to:

1. Represent a deck without confusing a gameplay-equivalent card with a particular printing.
2. Validate structural deck rules independently from format-card-pool legality.
3. Support every format described by Comprehensive Rules v8.0.
4. Account for construction rules printed on cards, which can override the normal rules.
5. Explain every validation failure in terms a player can act on.
6. Report aspect penalties without incorrectly treating off-aspect cards as illegal.
7. Preserve enough version information to reproduce a previous legality result.
8. Validate a Trilogy entry as one three-deck package rather than as three unrelated decks.
9. Validate Limited decks against the cards actually available in the player's pool.
10. Remain extensible when formats, rotation symbols, suspension lists, or card-specific rules change.

## 2. Scope

### 2.1 In scope

- Leader and base selection.
- Main draw-deck composition.
- Sideboard composition where the selected format permits one.
- Minimum deck sizes and the absence of a general maximum deck size.
- Copy identity and copy limits.
- Format card-pool and suspension checks.
- Limited-pool ownership checks.
- Aspect-provider calculation and aspect-penalty reporting.
- Card-text construction overrides.
- Token requirements associated with a completed deck.
- Validation output, error codes, warnings, and test expectations.

### 2.2 Out of scope

- Gameplay sequencing after a match begins.
- Mulligans, opening hands, resource selection, initiative, and battlefield setup except where they clarify what belongs in a deck.
- Tournament registration deadlines, sleeves, deck checks, penalties, and judge procedure.
- Matchmaking and tournament pairing.
- Strategic deck-quality advice.
- The complete rules for sideboarding between games.

The application may later implement these features, but they are not deck-construction requirements.

## 3. Sources and authority

### 3.1 Primary rules source

The primary source is the project owner's copy of *Star Wars: Unlimited Comprehensive Rules v8.0*:

`SWH_Comp_Rules_v8_0_e26603c6e1.pdf`

The most relevant sections are:

| Rules section | Subject used by this specification |
| --- | --- |
| 1.2 | General definition of a deck |
| 1.3 | Golden rules and card-text precedence |
| 1.5.6 | The six aspects |
| 2.14 | Rotation symbols on cards |
| 3.2 | Bases and base construction abilities |
| 3.4 | Leaders |
| 3.7 | Tokens |
| 8.1 | Aspect icons and aspect penalties |
| 8.5 | Copies of cards and normal copy limits |
| 9.2 | Premier and Eternal construction |
| 9.3 | Trilogy construction |
| 10.2 | Sealed construction |
| 10.3 | Draft construction |
| 12.1 | Twin Suns construction |

### 3.2 Supplemental official sources

The application will also need versioned data from official format guidance, including:

- [Premier format guidance](https://starwarsunlimited.com/how-to-play?chapter=premier)
- [Trilogy format introduction](https://starwarsunlimited.com/articles/three-decks-one-duel)
- [Sealed and Draft guidance](https://starwarsunlimited.com/articles/unsealing-unlimited)

Supplemental sources may clarify current card pools or event procedure, but must not silently rewrite the v8.0 structural rules in this document.

### 3.3 Rule precedence

Within their respective scopes, the validator MUST apply rules in this order:

1. Construction instructions printed on a card, when they directly override a structural rule.
2. The Comprehensive Rules.
3. Official format-specific and tournament-policy data for card-pool eligibility, suspensions, and event procedure.
4. This implementation specification.

The Comprehensive Rules expressly allow card text to override general rules. A validator that recognizes only the baseline limits can therefore return a false result. Unsupported construction-changing card text must produce an indeterminate result rather than a confident legal result. An override applies only to what it says: for example, a higher printed copy limit does not remove a format suspension or make an otherwise ineligible card legal.

## 4. Terminology

### 4.1 Deck package

A **deck package** is everything submitted for one format entry. It may contain:

- one ordinary deck and an optional sideboard;
- one Limited deck and its available card pool; or
- three decks for Trilogy.

### 4.2 Deck

For construction purposes, a **deck** includes its selected leader or leaders, its base, and its draw deck. A sideboard is associated with the deck but is stored as a separate zone.

During gameplay, leaders and bases are not part of the draw deck. The data model must keep them separate even though the rules count them as part of the constructed deck.

### 4.3 Draw deck

The **draw deck** contains only units, events, and upgrades. Unless a format says otherwise, its size has a minimum but no maximum.

### 4.4 Sideboard

A **sideboard** is a separate collection of non-leader, non-base cards available for between-game changes in a format that permits it. It is not counted toward the draw-deck minimum.

### 4.5 Available pool

An **available pool** is the multiset of cards a player may use to build a Sealed or Draft deck. It is not a sideboard. Pool membership and quantity constrain the submitted deck.

### 4.6 Card definition and printing

A **card definition** represents the printed gameplay attributes used to decide whether two cards are copies.

A **printing** represents a physical or digital release of that card, including set, collector number, variant, finish, language, and image.

Several printings can resolve to one card definition.

### 4.7 Copy

Two cards are copies when all of their printed gameplay attributes match, ignoring reminder text. The comparison includes, where applicable:

- name;
- subtitle;
- uniqueness;
- card type;
- arena;
- cost;
- aspects;
- traits;
- power or power modifier;
- HP or HP modifier; and
- abilities.

The following do not independently distinguish copies:

- set code;
- collector number;
- artwork;
- foil treatment;
- border treatment;
- language;
- rarity;
- reminder text; or
- temporary modifiers applied during a game.

Cards with the same name are not necessarily copies. Conversely, alternate-art or reprinted cards with identical gameplay attributes are copies.

### 4.8 Format legality snapshot

A **format legality snapshot** is a dated, immutable record of:

- the permitted rotation symbols or sets;
- reprint-equivalence policy;
- the suspended-card list;
- special event exceptions; and
- the source and effective date of each item.

Structural validation and snapshot-based legality validation must be independently reportable.

## 5. Card data requirements

Each catalog card used for validation MUST expose or derive the following fields:

```json
{
  "printingId": "string",
  "canonicalGameplayId": "string",
  "name": "string",
  "subtitle": "string-or-null",
  "unique": true,
  "cardType": "leader|base|unit|event|upgrade|token",
  "arena": "ground|space|null",
  "cost": 3,
  "aspects": ["command", "heroism"],
  "traits": ["REBEL"],
  "power": 3,
  "hp": 4,
  "abilities": ["normalized printed ability text"],
  "setCode": "SOR",
  "collectorNumber": "001",
  "rotationSymbol": "string-or-null",
  "rarity": "common",
  "constructionRules": []
}
```

Fields that do not apply to a card type may be `null`, but must not be omitted from the canonicalization process by accident.

### 5.1 Canonical gameplay identity

`canonicalGameplayId` MUST identify copy equivalence, not a printing. It SHOULD be a stable catalog identifier. If the source catalog has no suitable identifier, the importer MAY derive one from a normalized serialization of the copy-defining attributes.

Normalization MUST:

- preserve meaningful differences in abilities;
- remove reminder text from the comparison;
- normalize insignificant whitespace and typography;
- preserve the number and identity of repeated aspect icons;
- distinguish `null` from a meaningful numeric value;
- be deterministic across imports; and
- be covered by regression tests.

The deck builder MUST NOT use `name`, set number, or image URL alone as the copy-count key.

### 5.2 Printing preservation

A deck entry SHOULD preserve a preferred `printingId` for display and export while counting copies by `canonicalGameplayId`.

If a user adds two different printings of the same definition, the UI MAY keep separate display rows, but the validator MUST aggregate their quantities for copy limits.

## 6. Deck manifest data model

### 6.1 Single-deck package

```json
{
  "schemaVersion": 1,
  "rulesVersion": "8.0",
  "format": "premier",
  "legalitySnapshotId": "premier-2026-07-08",
  "leader": {
    "canonicalGameplayId": "leader-id",
    "printingId": "printing-id"
  },
  "secondLeader": null,
  "base": {
    "canonicalGameplayId": "base-id",
    "printingId": "printing-id"
  },
  "drawDeck": [
    {
      "canonicalGameplayId": "card-id",
      "printingId": "printing-id",
      "count": 3
    }
  ],
  "sideboard": [],
  "availablePool": null,
  "metadata": {
    "name": "Example deck",
    "notes": ""
  }
}
```

`format` MUST be one of:

- `premier`
- `eternal`
- `trilogy`
- `sealed`
- `draft`
- `twin-suns`

### 6.2 Trilogy package

```json
{
  "schemaVersion": 1,
  "rulesVersion": "8.0",
  "format": "trilogy",
  "cardPoolPolicy": "premier",
  "legalitySnapshotId": "premier-2026-07-08",
  "decks": [
    { "leader": {}, "base": {}, "drawDeck": [], "sideboard": [] },
    { "leader": {}, "base": {}, "drawDeck": [], "sideboard": [] },
    { "leader": {}, "base": {}, "drawDeck": [], "sideboard": [] }
  ]
}
```

`cardPoolPolicy` MUST be `premier` or `eternal`. Trilogy has no separate card pool or suspension list.

### 6.3 Limited pool entries

An available-pool entry MUST include `canonicalGameplayId`, one or more printing references, and an available count. Leaders and bases must be represented in the pool when their origin matters.

The model MAY separately mark a Common base as `borrowedCommonBase` because the rules allow an appropriate Common base that was not opened or drafted.

## 7. Universal construction rules

The following rules apply unless a format or card instruction expressly overrides them.

### 7.1 Card zones and types

- A selected leader slot MUST contain a leader card.
- A selected base slot MUST contain a base card.
- Every draw-deck card MUST be a unit, event, or upgrade.
- A token MUST NOT appear in the leader slot, base slot, draw deck, sideboard, or Limited quantity calculations.
- Tokens needed by cards in the deck SHOULD be listed separately as accessories.

### 7.2 Leader count

A deck normally has exactly one leader. Twin Suns replaces this rule with exactly two leaders. Card instructions may create future exceptions.

### 7.3 Base count

A deck has exactly one base unless a card or future format expressly changes that requirement.

### 7.4 Deck size

There is no general maximum deck size. The validator MUST NOT invent a maximum for performance, UI, or export convenience.

Format minimums count only units, events, and upgrades in the draw deck. Leaders, bases, sideboards, tokens, and unselected Limited-pool cards do not satisfy the minimum.

### 7.5 Aspects do not restrict inclusion

A player may include cards of any aspect. A card whose aspects are not fully supplied by the deck's leader or leaders and base is still legal to include.

The validator MUST report off-aspect play costs as analysis or warnings, not as construction errors.

### 7.6 Normal copy limit

Unless a format or card instruction changes it, a draw deck may contain no more than three copies of any unit, event, or upgrade.

Copy counts MUST aggregate all printings that resolve to the same `canonicalGameplayId`.

## 8. Aspect analysis

### 8.1 Aspect vocabulary

The six aspects are:

- Vigilance
- Command
- Aggression
- Cunning
- Villainy
- Heroism

Neutral cards have no aspect icons.

### 8.2 Provided aspect icons

The deck's provided-aspect multiset is composed from:

- every aspect icon on the selected base;
- every aspect icon on the selected leader; and
- in Twin Suns, every aspect icon on both selected leaders.

Multiplicity matters. Providing one Command icon is different from providing two Command icons.

### 8.3 Penalty calculation

For each card, let `required[A]` be the number of icons of aspect `A` printed on the card and `provided[A]` the number supplied by the deck's leader or leaders and base.

```text
missingIcons = sum over every aspect A of max(0, required[A] - provided[A])
aspectPenalty = 2 * missingIcons
```

The calculated penalty is the additional resource cost normally paid to play the card. It is not added to the card's printed cost in stored catalog data.

Examples:

- A neutral card has a penalty of 0.
- A card with one Aggression icon in a deck that supplies no Aggression has a penalty of 2.
- A card with two Command icons in a deck that supplies one Command has a penalty of 2.
- A card with Command and Heroism in a deck supplying neither has a penalty of 4.

The UI SHOULD show the penalty on each card and SHOULD summarize the number of cards affected.

## 9. Format profiles

### 9.1 Summary matrix

| Format | Leaders | Bases | Minimum draw deck | Normal copy limit | Sideboard | Extra scope |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| Premier | 1 | 1 | 50 | 3 | Up to 10 | Current Premier legality snapshot |
| Eternal | 1 | 1 | 50 | 3 | Up to 10 | Current Eternal legality snapshot |
| Trilogy | 1 per deck | 1 per deck | 50 per deck | 3 across all three decks | None | Exactly three decks; leaders and bases unique across package |
| Sealed | 1 | 1 | 30 | No fixed limit | No constructed sideboard | Must be supported by sealed pool |
| Draft | 1 | 1 | 30 | No fixed limit | No constructed sideboard | Must be supported by drafted pool |
| Twin Suns | 2 different leaders | 1 | 80 | 1 | None defined | Heroism/Villainy leader restriction |

All minimums refer to the count of units, events, and upgrades in the draw deck.

### 9.2 Premier

A Premier deck MUST satisfy all of the following:

1. Exactly one leader.
2. Exactly one base.
3. At least 50 units, events, and upgrades in the draw deck.
4. No more than three copies of a unit, event, or upgrade in the draw deck, unless card text changes the limit.
5. No more than 10 cards in the sideboard.
6. No leader, base, or token in the sideboard.
7. Every card must be legal under the selected Premier legality snapshot.
8. No card may be on the snapshot's Premier suspension list.

Premier legality is time-dependent. Comprehensive Rules v8.0 describes Premier as generally using cards from the two most recent rotation symbols. The actual symbols, reprint handling, exceptions, and suspensions MUST come from versioned policy data rather than being hard-coded into deck validation.

### 9.3 Eternal

An Eternal deck uses the same structural requirements as Premier:

1. Exactly one leader.
2. Exactly one base.
3. At least 50 cards in the draw deck.
4. Normally no more than three copies of a draw-deck card.
5. Up to 10 cards in the sideboard.
6. No leader, base, or token in the sideboard.

Eternal generally permits cards from all released sets, but cards may still be suspended. Every card MUST be checked against a dated Eternal legality snapshot.

### 9.4 Trilogy

A Trilogy entry is one package containing exactly three decks.

Each individual deck MUST contain:

- exactly one leader;
- exactly one base;
- at least 50 units, events, and upgrades; and
- no sideboard.

Across the complete three-deck package:

- no two selected leaders may be copies;
- no two selected bases may be copies; and
- the total quantity of any one unit, event, or upgrade may not exceed three, unless card text overrides that limit.

The aggregate copy check includes all three draw decks. For example, two copies of a card in deck A and two copies in deck B is illegal because the package contains four copies.

Trilogy MUST select either the Premier or Eternal legality policy. It inherits that format's current card pool and suspension list. It does not have an independent legality list.

The match's deck-selection and ban procedure is outside construction validation.

### 9.5 Sealed

A Sealed deck MUST satisfy all of the following:

1. Exactly one leader selected from the allowed sealed-pool leaders.
2. Exactly one base selected either from the sealed pool or from a permitted Common base for the event's set.
3. At least 30 units, events, and upgrades.
4. Every non-borrowed card quantity must be supported by the available sealed pool.
5. No fixed three-copy limit applies to units, events, or upgrades.

The ordinary sealed pool described in v8.0 is produced from six booster packs of one set. Event products may provide additional authorized leader options; those options must be represented as explicit event-policy data rather than assumed globally.

If a player opened five copies of a card, all five may be included. If the pool contains only two, the deck may not claim three.

Unselected pool cards are not modeled as a constructed-format sideboard. An event may permit deck changes using the remaining pool; that behavior belongs to event policy.

### 9.6 Draft

A Draft deck MUST satisfy all of the following:

1. Exactly one drafted leader.
2. Exactly one base selected either from the drafted pool or from a permitted Common base for the drafted set.
3. At least 30 units, events, and upgrades.
4. Every non-borrowed card quantity must be supported by the drafted pool.
5. No fixed three-copy limit applies to units, events, or upgrades.

The normal draft pool begins with three booster packs and is created by the official drafting procedure. Pool provenance SHOULD be recorded, but reproducing the drafting procedure is not required to validate a completed deck.

As in Sealed, remaining drafted cards form an available pool, not a constructed-format sideboard.

### 9.7 Twin Suns

A Twin Suns deck MUST satisfy all of the following:

1. Exactly two leaders.
2. The two leaders must be different card definitions; they may share a name if they are not copies under the full copy-identity rule.
3. The faceup sides of the two leaders at the start of the game must not collectively provide both Heroism and Villainy.
4. Exactly one base.
5. At least 80 units, events, and upgrades.
6. No more than one copy of any card in the deck unless a card instruction changes that limit.

The leader-aspect rule is best implemented as this predicate:

```text
invalid when
  startingLeaderAspects contains HEROISM
  and startingLeaderAspects contains VILLAINY
```

It is not necessary for the two leaders to share an aspect. It is only forbidden for their combined starting-side icons to include both Heroism and Villainy.

Both leaders contribute their printed aspect icons to aspect-penalty analysis.

## 10. Sideboard requirements

### 10.1 Registered sideboard validation

For Premier and Eternal, the validator MUST enforce:

- quantity from 0 through 10 inclusive;
- units, events, and upgrades only;
- no tokens;
- the same card-pool and suspension policy used by the main deck; and
- any construction instruction that explicitly applies to the sideboard or submitted package.

For Trilogy and Twin Suns, a sideboard MUST be rejected. Sealed and Draft remaining pools MUST be represented as available pools rather than sideboards.

### 10.2 Copy-count policy boundary

Comprehensive Rules v8.0 states the normal three-copy limit for cards in a deck and separately allows a sideboard of up to 10 cards in Premier and Eternal. It does not unambiguously state in the construction section whether identical copies are aggregated across the draw deck and registered sideboard.

Therefore:

- the core v8.0 validator MUST enforce copy limits on every playable draw-deck configuration;
- it MUST validate sideboard size and card types;
- it MUST NOT invent a combined main-plus-sideboard limit without a controlling policy source; and
- it MAY apply a `combinedPackageCopyLimit` only when a dated tournament or format policy explicitly supplies one.

If the application supports proposed sideboard swaps, the resulting draw deck MUST still satisfy minimum size, type, copy-limit, legality, suspension, and card-text rules.

## 11. Card-pool legality and suspensions

### 11.1 Separation from structural validation

The validator MUST return separate statuses for:

- **structural legality**: leaders, base, size, zones, copies, format shape, and pool counts;
- **format legality**: rotation, release eligibility, reprint policy, and suspensions; and
- **overall legality**: legal only if every required category is legal.

An unavailable legality snapshot must not cause the deck to be reported as legal. The correct format status is `unknown` or `indeterminate`.

### 11.2 Snapshot contents

A legality snapshot SHOULD have this shape:

```json
{
  "id": "premier-2026-07-08",
  "format": "premier",
  "effectiveFrom": "2026-07-08",
  "effectiveTo": null,
  "allowedRotationSymbols": ["symbol-a", "symbol-b"],
  "allowedSetCodes": [],
  "suspendedCanonicalGameplayIds": [],
  "reprintPolicy": "official-policy-id",
  "exceptions": [],
  "sources": ["https://official-source.example"],
  "retrievedAt": "2026-07-08T00:00:00Z"
}
```

The application SHOULD retain old snapshots so an imported or historical deck can be evaluated as of its intended date.

### 11.3 Unknown cards

If a manifest references an unknown printing but supplies a known canonical ID, the validator MAY validate copy counts and structure but MUST report the unresolved printing.

If the canonical definition is unknown, any check dependent on type, aspects, abilities, or legality is indeterminate. The card must not be silently ignored.

## 12. Construction-changing card text

### 12.1 General requirement

Construction-changing card text can override normal format rules. The importer and validator MUST support structured construction rules rather than relying only on keyword searches at validation time.

Known v8.0 catalog example:

- **Swarming Vulture Droid** permits up to 15 copies of itself in a deck.

Consequently, 15 copies can be legal where the normal profile permits only three or one, provided no more specific rule prevents it. Sixteen copies remain illegal.

### 12.2 Structured representation

```json
{
  "sourceCanonicalGameplayId": "swarming-vulture-droid-id",
  "kind": "copyLimit",
  "target": "self",
  "maximum": 15,
  "appliesToFormats": ["*"],
  "source": "printed-card-text",
  "parserVersion": 1,
  "reviewStatus": "verified"
}
```

The model must be extensible to rules that modify:

- maximum copies;
- leader or base selection;
- aspect constraints;
- minimum or maximum deck size;
- legal card types;
- set or trait restrictions; or
- other format-specific requirements.

### 12.3 Override evaluation

The validator SHOULD construct an effective rule profile in this sequence:

1. Start with universal rules.
2. Apply the selected format profile.
3. Apply the selected legality snapshot.
4. Discover construction instructions on selected leaders, bases, and included cards.
5. Apply verified overrides according to their printed scope.
6. Validate the final package against the effective profile.

An override is not permission to ignore unrelated constraints. A higher copy limit, for example, does not change deck size, card type, card-pool legality, or Limited-pool ownership.

### 12.4 Unsupported overrides

If catalog text appears to change deck construction but has no verified structured rule, the validator MUST emit `CONSTRUCTION_OVERRIDE_UNSUPPORTED` and set overall legality to `indeterminate`.

The project SHOULD maintain regression fixtures for every recognized construction-changing card.

## 13. Tokens and deck accessories

Tokens are not part of a deck and do not count toward any deck-size or copy-limit requirement. They must not be shuffled into or registered as part of the draw deck.

The builder SHOULD derive a `requiredTokens` list from abilities in the completed deck. This list is a convenience for setup and may include substitute markers because the rules allow suitable replacements for tokens and counters.

An absent token accessory SHOULD normally be a warning, not a deck-legality error.

Example representation:

```json
{
  "requiredTokens": [
    {
      "tokenType": "token-definition-id",
      "suggestedMinimum": 2,
      "createdBy": ["canonical-gameplay-id"]
    }
  ]
}
```

## 14. Validation pipeline

Validation MUST be deterministic for a fixed manifest, catalog version, rules version, and legality snapshot.

### Step 1: Parse and resolve

- Validate manifest schema and positive integer quantities.
- Resolve every printing and canonical card definition.
- Reject duplicate rows only if they cannot be safely aggregated.
- Preserve display-printing choices while aggregating by canonical identity.

### Step 2: Select a rules profile

- Resolve the requested format.
- For Trilogy, resolve its Premier or Eternal card-pool policy.
- Resolve the v8.0 structural profile.
- Resolve the requested legality snapshot.

### Step 3: Discover construction overrides

- Examine leaders, bases, and included cards.
- Load verified structured construction rules.
- Mark unknown construction-changing text as indeterminate.
- Build the effective profile.

### Step 4: Validate slots and zones

- Check leader count and card types.
- Check base count and card type.
- Check that draw-deck and sideboard entries use permitted card types.
- Reject tokens from deck zones.
- Check format support for sideboards.

### Step 5: Validate sizes

- Sum quantities in the draw deck only.
- Apply the correct format minimum.
- Apply the sideboard maximum where relevant.
- Do not enforce a maximum main-deck size without an explicit rule.

### Step 6: Validate copy limits

- Aggregate quantities by canonical gameplay identity.
- Apply format scope: one draw deck, all three Trilogy draw decks, or singleton Twin Suns.
- Apply verified card-text exceptions.
- Do not apply the normal three-copy rule to Sealed or Draft.

### Step 7: Validate cross-deck or Limited constraints

- For Trilogy, enforce exactly three decks and aggregate leader, base, and draw-deck identities.
- For Sealed and Draft, ensure every selected quantity is supported by the available pool, except an explicitly permitted borrowed Common base.
- For Twin Suns, validate leader difference and the Heroism/Villainy predicate.

### Step 8: Validate the format card pool

- Check every leader, base, draw-deck card, and sideboard card against the selected legality snapshot.
- Apply reprint and exception policy from the snapshot.
- Check suspensions.
- Return `unknown` if required policy data is absent or stale beyond the application's declared tolerance.

### Step 9: Analyze aspects and accessories

- Build the provided-aspect multiset.
- Calculate each card's normal aspect penalty.
- Derive required token accessories where possible.
- Report these as warnings or informational findings.

### Step 10: Return a result

The result MUST contain machine-readable findings and a user-facing summary.

```json
{
  "overallStatus": "legal|illegal|indeterminate",
  "structuralStatus": "legal|illegal|indeterminate",
  "formatLegalityStatus": "legal|illegal|indeterminate",
  "errors": [],
  "warnings": [],
  "info": [],
  "statistics": {
    "drawDeckCount": 50,
    "sideboardCount": 10,
    "uniqueCardDefinitions": 24,
    "cardsWithAspectPenalty": 3
  },
  "inputs": {
    "rulesVersion": "8.0",
    "catalogVersion": "string",
    "legalitySnapshotId": "string-or-null"
  }
}
```

## 15. Findings and error codes

Every finding SHOULD include:

- `code`;
- `severity`;
- `message`;
- affected zone or deck index;
- affected canonical and printing IDs where applicable;
- expected and actual values; and
- the rule source or policy source.

### 15.1 Errors

| Code | Meaning |
| --- | --- |
| `DECK_FORMAT_UNKNOWN` | The requested format is unsupported. |
| `MANIFEST_INVALID` | The manifest cannot be interpreted safely. |
| `CARD_UNKNOWN` | A canonical card definition cannot be resolved. |
| `LEADER_COUNT_INVALID` | The format has the wrong number of leaders. |
| `LEADER_TYPE_INVALID` | A selected leader is not a leader card. |
| `BASE_COUNT_INVALID` | The format has the wrong number of bases. |
| `BASE_TYPE_INVALID` | A selected base is not a base card. |
| `DRAW_DECK_TOO_SMALL` | The draw deck is below its format minimum. |
| `DRAW_DECK_CARD_TYPE_INVALID` | A draw-deck entry is not a unit, event, or upgrade. |
| `TOKEN_IN_DECK_ZONE` | A token appears in a constructed deck zone. |
| `SIDEBOARD_NOT_ALLOWED` | The format does not permit a sideboard. |
| `SIDEBOARD_TOO_LARGE` | The sideboard contains more than the allowed number of cards. |
| `SIDEBOARD_CARD_TYPE_INVALID` | A leader, base, token, or other invalid type is in the sideboard. |
| `COPY_LIMIT_EXCEEDED` | The effective copy limit is exceeded. |
| `CARD_NOT_FORMAT_LEGAL` | The card is outside the selected legality snapshot. |
| `CARD_SUSPENDED` | The card is suspended in the selected snapshot. |
| `TRILOGY_DECK_COUNT_INVALID` | A Trilogy package does not contain exactly three decks. |
| `TRILOGY_LEADER_REUSED` | Copy-equivalent leaders appear in more than one Trilogy deck. |
| `TRILOGY_BASE_REUSED` | Copy-equivalent bases appear in more than one Trilogy deck. |
| `TWIN_SUNS_LEADERS_ARE_COPIES` | The selected Twin Suns leaders are copy-equivalent. |
| `TWIN_SUNS_ALIGNMENT_CONFLICT` | The two starting leader faces collectively include Heroism and Villainy. |
| `LIMITED_POOL_QUANTITY_EXCEEDED` | The deck uses more copies than the available pool contains. |
| `LIMITED_LEADER_NOT_IN_POOL` | The selected Limited leader is not an allowed pool leader. |
| `LIMITED_BASE_NOT_ALLOWED` | The selected Limited base is neither in the pool nor a permitted Common base. |

### 15.2 Indeterminate findings

| Code | Meaning |
| --- | --- |
| `LEGALITY_SNAPSHOT_MISSING` | Time-dependent legality cannot be determined. |
| `LEGALITY_SNAPSHOT_STALE` | The application cannot guarantee that policy data is current. |
| `CONSTRUCTION_OVERRIDE_UNSUPPORTED` | Card text may change construction but has not been modeled. |
| `CARD_ATTRIBUTES_INCOMPLETE` | Copy identity or another required rule cannot be evaluated. |

### 15.3 Warnings and information

| Code | Meaning |
| --- | --- |
| `ASPECT_PENALTY` | A card normally costs additional resources because icons are not supplied. |
| `PRINTING_UNRESOLVED` | The card definition is known, but the selected printing is not. |
| `TOKEN_ACCESSORY_SUGGESTED` | The deck can create a token the player may want available. |
| `DECK_ABOVE_MINIMUM` | Informational count showing cards beyond the minimum, not an error. |

## 16. User-interface requirements

The deck builder SHOULD prevent obvious mistakes while still allowing an incomplete work in progress.

### 16.1 Editing state versus submitted state

An editing deck may be incomplete and should display live findings without blocking every change. A deck marked `ready`, exported as legal, or submitted MUST pass full validation.

### 16.2 Required visible information

The UI SHOULD display:

- selected format and rules version;
- legality snapshot date;
- leader or leaders and base;
- draw-deck count against the format minimum;
- sideboard count against its maximum;
- aggregate copy counts across alternate printings;
- aspect icons supplied by leaders and base;
- per-card aspect penalties;
- structural and format-legality status separately; and
- clear remediation for each error.

For Trilogy, the UI MUST also show package-wide usage counts. Adding a third copy to one deck must make it clear that the same card is now unavailable to the other two decks under the normal aggregate limit.

For Sealed and Draft, the UI SHOULD show `used / available` counts and prevent quantities from exceeding the pool.

### 16.3 Printing selection

Changing artwork or printing SHOULD NOT change deck legality when the new printing maps to the same canonical gameplay identity, except where a dated format policy specifically uses printing-level information.

## 17. Import and export behavior

### 17.1 Import

An importer MUST:

- resolve cards as precisely as the source format permits;
- retain source set and collector information when available;
- aggregate copy counts by canonical gameplay identity for validation;
- report ambiguous same-name matches rather than choosing silently;
- retain unknown entries so the user can repair them; and
- record the assumed format and legality date.

Name-only import is inherently ambiguous because cards can share a name without being copies. The importer SHOULD use subtitle, type, cost, aspects, set, and collector number to disambiguate.

### 17.2 Export

An export intended for re-import SHOULD contain:

- schema version;
- rules version;
- format;
- legality snapshot or intended legality date;
- canonical IDs;
- preferred printing IDs;
- quantities and zones;
- all three decks for Trilogy; and
- Limited-pool information when the export is intended to preserve pool validation.

A human-readable export SHOULD separate leaders, base, draw deck, sideboard, and available pool.

## 18. Required test suite

The validator is not complete until the following cases are automated.

### 18.1 Identity and copy tests

1. Three identical printings pass in a normal constructed deck.
2. Four identical printings fail.
3. Two normal-art and two alternate-art printings of the same definition aggregate to four and fail.
4. Cards with the same name but different gameplay attributes do not aggregate.
5. Reminder-text and cosmetic differences do not create a new definition.
6. Temporary gameplay modifiers are never included in copy identity.
7. Fifteen Swarming Vulture Droids pass; sixteen fail.

### 18.2 Premier and Eternal tests

1. A 49-card draw deck fails.
2. A 50-card draw deck passes the size rule.
3. A deck larger than 50 is not rejected for size.
4. A sideboard of 10 valid cards passes.
5. A sideboard of 11 fails.
6. A leader or base in the sideboard fails.
7. An off-aspect card remains structurally legal.
8. A suspended card fails the selected legality snapshot.
9. Missing legality data produces `indeterminate`, not `legal`.

### 18.3 Trilogy tests

1. A package with two or four decks fails.
2. Each deck independently requires 50 draw-deck cards.
3. Reusing a copy-equivalent leader fails.
4. Reusing a copy-equivalent base fails.
5. Two copies of a card in deck A plus one in deck B pass.
6. Two copies in deck A plus two in deck B fail.
7. Any non-empty sideboard fails.
8. Premier-policy and Eternal-policy snapshots can produce different legality results for the same structurally valid package.

### 18.4 Limited tests

1. A 29-card Sealed or Draft deck fails.
2. A 30-card deck passes the size rule.
3. Five copies pass when the pool contains five.
4. Three copies fail when the pool contains two.
5. A pool leader passes; a leader outside the allowed pool fails.
6. A Common base of the appropriate set passes when marked as a permitted borrowed base.
7. An inappropriate or non-Common borrowed base fails.

### 18.5 Twin Suns tests

1. One or three leaders fails.
2. Two copy-equivalent leaders fail.
3. Two leaders with the same name but different copy-defining attributes may pass.
4. Combined Heroism and Villainy leader icons fail.
5. Leaders without that combined conflict pass even when they share no aspect.
6. A 79-card draw deck fails; an 80-card deck passes size validation.
7. Two copies of an ordinary card fail.
8. A verified construction override replaces the singleton limit only for its intended target.

### 18.6 Aspect tests

1. Neutral card penalty is zero.
2. One missing icon produces a penalty of 2.
3. Two different missing icons produce a penalty of 4.
4. A repeated aspect icon is evaluated by multiplicity.
5. Both Twin Suns leaders contribute aspect icons.
6. Aspect penalties never make a deck structurally illegal.

### 18.7 Token and zone tests

1. Tokens do not increase draw-deck size.
2. Tokens in a deck zone are rejected.
3. Token requirements can be derived without altering legality.

## 19. Acceptance criteria

The first complete implementation of this specification is accepted when:

1. All six format profiles can be selected and validated.
2. Copy identity aggregates alternate printings using gameplay attributes.
3. Premier and Eternal use versioned legality snapshots.
4. Trilogy validates all three decks as one package.
5. Sealed and Draft validate against explicit available pools.
6. Twin Suns applies its two-leader, alignment, minimum-size, and singleton rules.
7. Aspect penalties are calculated and presented separately from legality.
8. At least one card-text copy-limit override is modeled and tested.
9. Unsupported construction-changing text returns an indeterminate result.
10. Every failure has a stable error code and actionable message.
11. The required tests in section 18 pass.

## 20. Recommended implementation phases

### Phase 1: Structural core

- Define card, printing, manifest, and result types.
- Build canonical identity aggregation.
- Implement Premier, Eternal, and Twin Suns structural validation.
- Implement aspect analysis.

### Phase 2: Policy and exceptions

- Add versioned legality snapshots.
- Add suspension checking.
- Parse and verify construction-rule metadata.
- Add Swarming Vulture Droid regression coverage.

### Phase 3: Multi-deck and Limited

- Implement Trilogy package validation.
- Implement Sealed and Draft pool validation.
- Add borrowed Common-base policy data.

### Phase 4: Product integration

- Add live editor findings.
- Add import and export.
- Add token-accessory suggestions.
- Add historical legality selection and source display.

## 21. Policy dependencies and open questions

The following are deliberately not hard-coded because v8.0 alone does not fully determine them:

1. The currently active Premier rotation symbols and their effective dates.
2. The current Premier and Eternal suspension lists.
3. The exact reprint policy used to legalize older printings or card definitions.
4. Whether a particular tournament aggregates copy limits across a registered draw deck and sideboard.
5. Event-specific promo leaders or other additions to a Sealed pool.
6. Which Common bases count as appropriate for a particular Limited event.
7. Whether and when Limited decks may be rebuilt between rounds.

Each dependency SHOULD be represented as dated policy data with a source. Missing policy must be visible to the user and must never be silently replaced with a guess.

## Appendix A: Rules-to-requirements traceability

| Requirement | Primary v8.0 basis |
| --- | --- |
| Leader and base are part of a deck for construction, but separate during gameplay | 1.2 |
| Tokens are not part of a deck | 1.2, 3.7 |
| Any aspect may be included | 1.2, 8.1 |
| Missing aspect icons add two resources each | 8.1 |
| Exactly one base normally | 3.2 |
| Exactly one leader normally | 3.4 |
| Full gameplay attributes determine copies | 8.5 |
| Normal maximum of three copies | 8.5 |
| Premier and Eternal: 50-card minimum and sideboard up to 10 | 9.2 |
| Trilogy: three decks and aggregate limits | 9.3 |
| Sealed: 30-card minimum and pool-based quantities | 10.2 |
| Draft: 30-card minimum and pool-based quantities | 10.3 |
| Twin Suns: two leaders, 80-card minimum, and singleton construction | 12.1 |
| Card text can override normal rules | 1.3; construction notes in 3.2 and 8.5 |

## Appendix B: Important implementation distinctions

The following pairs must remain distinct throughout the codebase:

| Do not conflate | Reason |
| --- | --- |
| Deck and draw deck | Leaders and bases belong to construction but are not shuffled into the draw deck. |
| Card definition and printing | Copy limits follow gameplay identity, while display and ownership often follow printings. |
| Same name and same copy | Full printed gameplay attributes determine copy identity. |
| Aspect penalty and illegality | Off-aspect cards are permitted. |
| Sideboard and Limited pool | They have different origins and validation rules. |
| Structural legality and format legality | A well-formed deck can still contain rotated or suspended cards. |
| Illegal and indeterminate | Missing policy or unmodeled overrides do not prove illegality. |
| One Trilogy deck and a Trilogy package | Copy limits and leader/base uniqueness cross all three decks. |
