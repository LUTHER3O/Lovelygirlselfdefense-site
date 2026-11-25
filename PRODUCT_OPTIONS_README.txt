PRODUCT OPTION IMPLEMENTATION
=============================
The product detail page retains selectable pill/button controls and now reads
buyer choices from assets/products.json.

Mystery Scoop products:
- Scoop Amount: 1 scoop through 5 scoops
- Color / Design: options shown in the screen recording
- Size: where the catalog specifies a size
- Brand: Louis Vuitton, Gucci, Chanel, Dior, YSL, Prada, Surprise me
- Would you like a video?: Yes / No

Fashion bags, safety keychain sets, and single safety items retain their own
Color / Design buttons and applicable Size buttons.

To edit a product's options, edit its fields in assets/products.json:
colors, sizes, scoopOptions, brandOptions, videoOptions.
The selected options are shown in the cart and are now included in the demo
order payload. Configure a real order endpoint before accepting live orders.

The 86 uploaded images are included in:
assets/images/uploaded-product-references/
They are kept as a reference library rather than being automatically attached
to unrelated products, because the ZIP does not include a product-to-image map.
Use the manifest in that folder to identify each original filename.
