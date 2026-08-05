# Custom Guess Who — Product Spec (v1)

This is the maintainer's original product spec, kept verbatim (lightly
reformatted) as the source of truth for *what to build*. `.claude/current.md`
breaks this down into a working roadmap checklist; `.claude/context.md`
tracks what's actually been built so far. If the roadmap checklist and this
spec ever disagree, this spec wins.

## Overview

A web app that lets anyone create and play a personalized version of Guess
Who using photos of friends, family, coworkers, or any group of people.

The core innovation is that AI automatically transforms uploaded photos into
a balanced set of recognizable Guess Who characters by applying a limited
set of visual modifications.

The goal is not to showcase AI. The goal is to create a fun, replayable
Guess Who board featuring people you actually know.

## Vision

Create a Guess Who board for any group in under 15 minutes.

Historically, this required commissioning an illustrator and carefully
designing the board. AI reduces the cost enough that custom boards become
practical.

## Core Principles

**AI is an enabling technology**
The user experience is about playing Guess Who. The AI disappears after
setup.

**Preserve the original game**
Questions should feel exactly like classic Guess Who. Examples:
- Do they have glasses?
- Are they wearing a hat?
- Do they have facial hair?
- Do they have earrings?
- Do they have long hair?

Avoid arbitrary distinctions that players wouldn't naturally ask.

**Recognition over realism**
Characters should still obviously represent the real people. Accuracy is
less important than recognizability. Exaggeration is encouraged.

## Workflow

### 1. Create Board

Choose a category:
- Family
- Friends
- Office
- Classroom
- Sports team
- Custom

Give the board a name.

### 2. Upload First Photo

The AI creates a stylized Guess Who portrait. Available feature
modifications are all unlocked. Example checklist:

- [ ] Glasses
- [ ] Hat
- [ ] Big nose
- [ ] Bushy eyebrows
- [ ] Mustache
- [ ] Beard
- [ ] Earrings
- [ ] Bow tie
- [ ] Curly hair
- [ ] Long hair
- [ ] Scar
- [ ] Freckles
- etc.

The user selects the desired modifications. AI regenerates the portrait.

### 3. Continue Adding People

Each new upload compares against the existing board. The app limits
available features to maintain game balance. Example:

```
Available

✓ Hat
✓ Thick eyebrows
✓ Big ears
✓ Beard

Unavailable

✗ Glasses
    Too many characters already use glasses.

✗ Mustache
    Already at target distribution.

✗ Curly hair
    Would duplicate another character.
```

The player naturally creates a balanced board while building it.

## Board Analysis

At all times the app displays board quality. Example:

```
Board Quality

★★★★★

Average guesses: 4.9

Duplicate combinations: 0

Feature balance: Excellent

Remaining unique feature combinations: 18
```

## AI Responsibilities

The AI should:
- remove backgrounds
- create a consistent illustration style
- preserve identity
- apply requested mutations
- exaggerate selected features naturally
- keep art style consistent across all portraits

The AI should not invent arbitrary distinguishing characteristics. All
distinguishing features come from the controlled feature list.

## Feature Pool

Features should all correspond to natural Guess Who questions.

**Accessories**
Glasses, Sunglasses, Hat, Bow, Earrings, Necklace, Tie, Bow tie

**Hair**
Long hair, Curly hair, Bald, Ponytail, Afro, Mohawk

**Face**
Big nose, Big ears, Thick eyebrows, Freckles, Dimples, Rosy cheeks, Chin
cleft

**Facial Hair**
Mustache, Beard, Goatee, Sideburns

**Clothing**
Hoodie, Suit, Scarf, Vest, Bright sweater

## Balancing Rules

Every feature has a target usage. Example, for a 24-player board:

```
Glasses:   12 yes / 12 no
Hat:        8 yes / 16 no
Beard:      6 yes / 18 no
Long hair: 10 yes / 14 no
```

The exact targets are computed automatically. As the board fills, feature
choices become more constrained.

## Game Generation

Once a board is complete, generate a playable mobile game.

Saving and editing games is also on the roadmap.
