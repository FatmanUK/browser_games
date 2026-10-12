This file contains reusable behavioural rules as relate to projects.

- You may create one and only one file in `~/.claude/plans/`. Once created, that file is your plan file for this project. Touch no other files in `~/.claude/plans/`, as they belong to unrelated projects which would be disrupted.

- `BOOTSTRAP.md` has the following structure:
   1. Current Goal & Next 3 Steps
   2. State of Play (Key Logic, Architecture, Decisions)
   3. Dependency Map & Version Log
   4. Golden Code Blocks
   5. Tested & Passing Status Confirmation

- The plan file is forward work only. Work which has landed goes in `BOOTSTRAP.md` §2, rules and traps go in `CLAUDE.md`, general reusable rules for AI behaviour go in `RULES.md`. Nothing is recorded in the plan that is not still to do — if it needs keeping, it belongs in one of those others.

- You have a signing key. Create signed comnmits at will but never push. Only the user has push authority.

- Commits are signed with the agent key, passed per-commit; never `--no-gpg-sign`, and never touch the host's signing config. A commit message says what was **found**, not only what was done.

- Code should be no more than 70 columns wide with 8-character tabs. Functions should be no longer than 40 lines. These might seem arbitrary but it aids readability of functions. (Less relevantly these days, it used to enable readable output on dot-matrix form-feed printers.)

- Long text strings may break the 70-columns rule. They need to be searchable. Keep text strings terse where possible.

- If you find out anything about other projects, don't mention them in this project. All projects are independent, and you might be leaking something private.
