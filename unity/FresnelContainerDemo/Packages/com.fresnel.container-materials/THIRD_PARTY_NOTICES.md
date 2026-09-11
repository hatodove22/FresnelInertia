# Origins and research references

The distributed solver, renderer, shaders and sample code are original work in
this project. No Obi source, paid asset, downloaded texture, or third-party
library source is included. `LICENSE.md` applies to this package's source.
Unity Engine/API remain separately provided by Unity under their own terms.

The numerical methods are informed by these public primary references:

- Miles Macklin and Matthias Müller, **Position Based Fluids**, 2013:
  https://matthias-research.github.io/pages/publications/pbf_sig_preprint.pdf
- Miles Macklin et al., **XPBD: Position-Based Simulation of Compliant
  Constrained Dynamics**, 2016:
  https://matthias-research.github.io/pages/publications/XPBD.pdf

These implementations were reviewed as alternatives, but are not bundled:

- https://github.com/InteractiveComputerGraphics/PositionBasedDynamics (MIT)
- https://github.com/InteractiveComputerGraphics/SPlisHSPlasH (MIT)
- https://github.com/Scrawk/PBD-Fluid-in-Unity (MIT)
- Matthias Müller's specifically licensed `18-flip.html` and `10-softBodies.html`
  examples at https://github.com/matthias-research/pages/tree/master/tenMinutePhysics

The named algorithms and research references do not imply endorsement,
identical implementations, numerical equivalence, or a performance guarantee.
