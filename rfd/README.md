# Lekishi Requests for Discussion

RFDs preserve product intent, alternatives, and the reasoning behind proposals.
Their existence does not imply approval or implementation; read their `state`
and distinguish established requirements from proposed technical choices.

| RFD | Topic |
|---|---|
| [1: Historical exploration and visual interactions](0001/README.adoc) | Globe-to-local exploration, playback, trade, learning, religion, conflict, and the first experience |
| [2: Historical data, time, and evidence](0002/README.adoc) | Places, actors, relationships, uncertain dates, citations, acquisition, and editorial review |
| [3: Browser architecture and native options](0003/README.adoc) | Phoenix baseline, proposed Svelte/Cesium client, rendering evaluation, persistence, and native boundaries |

## Format and lifecycle

Following [Shosai's RFD format](https://github.com/chaba-dev/shosai/tree/main/rfd),
each proposal lives at `rfd/NNNN/README.adoc` and begins with:

```asciidoc
:authors: Name <contact>
:state: prediscussion
:discussion:
:labels: topic, another-topic

= RFD 1 Example title
```

Authors are semicolon-separated, labels comma-separated, and the title uses an
unpadded number. Metadata lives only in the RFD, not duplicated in this index.
The discussion attribute receives the pull-request URL when review begins.
Each RFD has one cross-linked `IMPLEMENTATION.adoc` checklist; implementation
progress is separate from the design record. Unlike Shosai's Org/Markdown
checklists, Lekishi uses AsciiDoc for both proposals and implementation plans.
Use `= RFD NNNN implementation checklist` for the document title, `==` for
sections, and `- [ ]` / `- [x]` for incomplete / complete tasks.

- `prediscussion`: being drafted before formal review.
- `ideation`: a topic or scratchpad without active revision.
- `discussion`: under review in the linked pull request.
- `published`: discussion has converged on project direction.
- `committed`: the described proposal is fully implemented.
- `abandoned`: retained for history but not proceeding.

Reserve the next unused number. Move drafts to `discussion` when a review PR
exists, to `published` when agreed, and to `committed` only after implementation.
Checklist completion does not automatically change state. Material changes to
published decisions need review and a new RFD when superseding the decision.

These initial drafts capture the founding discussion, not authorization to
install their proposed stack or implement their checklists. Lekishi does not
yet have Shosai's `make check-rfds` automation.
