import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeSiteSettings } from "../lib/site-settings/sanitize";
import { defaultSiteSettings } from "../lib/site-settings/defaults";

test("sanitizeSiteSettings returns defaults for empty or invalid payloads", () => {
  assert.deepEqual(sanitizeSiteSettings(null), defaultSiteSettings);
  assert.deepEqual(sanitizeSiteSettings(undefined), defaultSiteSettings);
  assert.deepEqual(sanitizeSiteSettings("garbage"), defaultSiteSettings);
  assert.deepEqual(sanitizeSiteSettings({}), defaultSiteSettings);
});

test("sanitizeSiteSettings normalizes object-shaped footer links to labels", () => {
  const result = sanitizeSiteSettings({
    landing: {
      footer: {
        productLinks: [{ label: "Voorbeeldrapport", href: "/voorbeeld" }, { label: "Prijzen" }],
        companyLinks: [{ title: "Contact" }],
        legalLinks: ["Privacybeleid", { broken: true }, 42]
      }
    }
  });
  assert.deepEqual(result.landing.footer.productLinks, ["Voorbeeldrapport", "Prijzen"]);
  assert.deepEqual(result.landing.footer.companyLinks, ["Contact"]);
  assert.deepEqual(result.landing.footer.legalLinks, ["Privacybeleid"]);
});

test("sanitizeSiteSettings falls back when link arrays contain no usable labels", () => {
  const result = sanitizeSiteSettings({
    landing: { footer: { productLinks: [123, { broken: true }] } }
  });
  assert.deepEqual(result.landing.footer.productLinks, defaultSiteSettings.landing.footer.productLinks);
});

test("sanitizeSiteSettings rejects hero images from non-whitelisted hosts", () => {
  const local = sanitizeSiteSettings({ content: { landingHeroImageUrl: "/custom-hero.png" } });
  assert.equal(local.content.landingHeroImageUrl, "/custom-hero.png");

  const allowed = sanitizeSiteSettings({
    content: { landingHeroImageUrl: "https://storage.googleapis.com/some/image.jpg" }
  });
  assert.equal(allowed.content.landingHeroImageUrl, "https://storage.googleapis.com/some/image.jpg");

  const blocked = sanitizeSiteSettings({ content: { landingHeroImageUrl: "https://evil.example.com/x.jpg" } });
  assert.equal(blocked.content.landingHeroImageUrl, defaultSiteSettings.content.landingHeroImageUrl);
});

test("sanitizeSiteSettings normalizes comma-decimal payment amounts for PayPal", () => {
  assert.equal(sanitizeSiteSettings({ payment: { amount: "6,95" } }).payment.amount, "6.95");
  assert.equal(sanitizeSiteSettings({ payment: { amount: "12.5" } }).payment.amount, "12.50");
  assert.equal(sanitizeSiteSettings({ payment: { amount: "gratis" } }).payment.amount, defaultSiteSettings.payment.amount);
  assert.equal(sanitizeSiteSettings({ payment: { amount: "-3" } }).payment.amount, defaultSiteSettings.payment.amount);
});

test("sanitizeSiteSettings defaults reviews to an empty array", () => {
  assert.deepEqual(sanitizeSiteSettings(null).reviews, []);
  assert.deepEqual(sanitizeSiteSettings({}).reviews, []);
  assert.deepEqual(sanitizeSiteSettings({ reviews: "not-an-array" }).reviews, []);
});

test("sanitizeSiteSettings keeps valid reviews and drops malformed entries", () => {
  const result = sanitizeSiteSettings({
    reviews: [
      { quote: "Snel en duidelijk.", author: "Jeroen K." },
      { quote: "Bespaarde me een miskoop.", author: "" },
      { quote: "", author: "Lege quote" },
      { broken: true },
      42
    ]
  });
  assert.deepEqual(result.reviews, [
    { quote: "Snel en duidelijk.", author: "Jeroen K." },
    { quote: "Bespaarde me een miskoop.", author: "" }
  ]);
});

test("sanitizeSiteSettings keeps valid values and fixes invalid types in one payload", () => {
  const result = sanitizeSiteSettings({
    paymentEnabled: false,
    payment: { amount: "4.95", currency: 12 },
    ui: { showPricingLink: "yes" },
    landing: {
      badgeTop: "Eigen badge",
      features: [{ id: "x", icon: "Gauge", title: "Custom", desc: "Desc" }, { title: "" }],
      workflow: "not-an-array"
    }
  });
  assert.equal(result.paymentEnabled, false);
  assert.equal(result.payment.amount, "4.95");
  assert.equal(result.payment.currency, defaultSiteSettings.payment.currency);
  assert.equal(result.ui.showPricingLink, defaultSiteSettings.ui.showPricingLink);
  assert.equal(result.landing.badgeTop, "Eigen badge");
  assert.deepEqual(result.landing.features, [{ id: "x", icon: "Gauge", title: "Custom", desc: "Desc" }]);
  assert.deepEqual(result.landing.workflow, defaultSiteSettings.landing.workflow);
});
