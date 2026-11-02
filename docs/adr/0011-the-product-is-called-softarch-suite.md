---
status: accepted
created: 2026-11-02
decided: 2026-11-02
decision-makers: [Philipp Saal]
tags: [name, release]
---

# The product is called Softarch Suite

Softarch Suite has been the working title since the design session of 2026-09-19 ([vision.md](../vision.md)); the roadmap left the final name to be settled before the first public release. The author has decided to keep it. The app calls itself Softarch Suite, and what was called ADR Tool is its Decisions module, as Structure is its second.

A search of the web found no product of that name. It found SoftArch, a research environment for modelling software architecture by John Grundy and John Hosking, published around 2000 to 2003 and not a product. Trademark registers, domains and the npm and GitHub names were not checked; that check stays due before the first public release.

## Considered Options

- **Keep ADR Tool.** It says what the first module does and nothing about the modules after it, and the first public release is already meant to carry the suite's name with navigation built for further modules.
- **Look for another name first.** Nothing found so far speaks against the working title, and every week under a working title makes the final one more expensive to introduce.

## Consequences

- The window, the app's `productName`, its texts and the README say Softarch Suite. The glossaries and the file format speak of the Decisions module.
- The repository, the package names (`@adr-tool/…`) and the command `adr` keep their names: they are read by developers, a rename would break links and imports, and the command is about ADRs whatever the suite is called.
- The app's folder for its own data follows the product name, so the first start under the new name does not remember the repositories of the last run, and analyses the code of each repository once more.
