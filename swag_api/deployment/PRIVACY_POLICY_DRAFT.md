# A'FRO Privacy Policy

## DRAFT FOR REVIEW — NOT YET PUBLISHED

**Effective date:** [CONFIRM WITH PROJECT OWNER]

This draft explains how A'FRO Dry Goods (the “App,” “we,” “us,” or “our”) may collect, use, store, and share information when you use the A'FRO thrift-shopping mobile app, related admin dashboard, and related services.

**Project owner/operator:** [CONFIRM WITH PROJECT OWNER]  
**Privacy contact email:** [CONFIRM WITH PROJECT OWNER]  
**Business/project address:** [CONFIRM WITH PROJECT OWNER]

## 1. Information we collect

### Account and contact information

When you create or update an account, we collect information such as your name, email address, mobile number, password, profile photo, cover photo, gender, style preferences, shopping-audience preferences, preferred size, and optional identity-document type and number.

We use this information to create and secure your account, let you sign in, recover or change your password, personalize the App, communicate with you, and provide customer support.

Passwords are stored as password hashes rather than as plain-text passwords.

### Delivery and address information

We collect delivery details such as house or unit number, street, barangay, city, province or region, postal code, and saved delivery address.

We use this information to help you enter an address, process orders, and support delivery-related order management.

### Order and transaction information

When you use the shopping and checkout features, we collect cart contents, selected products and sizes, quantities, prices, order status, delivery/tracking details, and order history. If you use the GCash payment flow implemented in the App, we may collect the GCash reference number and a payment-receipt image.

We use this information to process and manage orders, verify payment information, provide order updates, and respond to support requests.

The current implementation does not show a direct integration with a payment gateway. [CONFIRM WITH PROJECT OWNER: identify the real payment processor, if any, and its privacy notice.]

### Photos, images, and uploads

Depending on the feature you use, we may collect and store:

- profile and cover photos;
- identity-verification uploads;
- payment-receipt images;
- product, review, and chat images;
- portrait and garment images submitted for virtual try-on; and
- generated virtual try-on result images.

We use these images to provide the feature you requested, such as profile display, account verification, payment review, product reviews, chat attachments, and virtual try-on.

### Virtual try-on and fit-related information

For virtual try-on, the App can send a portrait image, garment image or images, product information, and fit-related information to the A'FRO backend. Where you provide them, this may include body measurements such as chest, waist, hip, and height.

We use this information to generate the requested virtual try-on result and related fit experience. We do not describe this feature as a medical, biometric-identification, or body-health service.

### Skin-tone information

The App can collect an image submitted for skin-tone analysis and can store a skin-tone color value (`skin_hex`) and a flag showing whether skin tone has been detected. This can be used for color/style personalization.

The current skin-tone provider connection has not been verified for production use. [CONFIRM WITH PROJECT OWNER: confirm whether the skin-tone feature will be active at launch, the provider name, what data is sent, the provider’s privacy notice, and the retention/deletion behavior of submitted images.]

### Messages, reviews, and support content

We collect messages sent through the App, chat attachments, product ratings, review text, and optional review photos.

We use this information to provide customer support, enable conversations, display product feedback, and manage inappropriate or abusive content.

### Notifications and device permissions

If you enable notifications, the App may collect an Expo push token and your notification preferences. We use this information to send order, support, and service-related notifications.

The App may request location permission to help fill in a delivery address. The implementation uses location information for address lookup/reverse geocoding. It does not show persistent storage of raw GPS coordinates. [CONFIRM WITH PROJECT OWNER: confirm whether any location coordinates are retained in logs or other systems.]

### Activity and preference information

We may collect information about products you save, cart activity, style preferences, shopping-audience preferences, preferred sizes, and personalization settings.

We use this information to operate saved items and carts and to personalize catalog recommendations and the shopping experience.

## 2. How we share information

We may share only the information needed to operate the relevant feature with service providers used by the App.

### Active or implemented service integrations

- **Brevo:** used to send email verification codes and email notifications. This may receive your email address and the content needed to send the message.
- **iProg SMS:** used to send and verify SMS one-time passwords. This may receive your mobile number and OTP-related request information.
- **Geoapify:** used for address autocomplete and reverse geocoding. Address search text or location coordinates may be sent for those requests.
- **Google Gemini:** used for the AI assistant/chat feature. Messages and the information needed to generate a reply may be sent when you use that feature. [CONFIRM WITH PROJECT OWNER: confirm the exact Gemini product/account and applicable provider privacy notice.]
- **Modal:** used by the virtual try-on service. Portrait images, garment images, and try-on-related input may be sent to generate the requested result.
- **Expo Push Notifications:** used for push notification delivery when you enable notifications. This may process your push token and notification content.
- **Cloudflare:** is planned for website hosting and secure API tunneling. [CONFIRM WITH PROJECT OWNER: confirm the final Cloudflare products in use and applicable privacy notice.]

### Planned or unverified integrations

- **Skin-tone analysis provider:** planned/implemented in code but not yet verified for production operation. See “Skin-tone information” above.

### Not identified as an integration

- **Cloudinary:** the reviewed implementation does not show Cloudinary use.
- **Shipping provider API:** the reviewed implementation does not show a third-party shipping API. Tracking information appears to be entered and managed by administrators. [CONFIRM WITH PROJECT OWNER: confirm the actual delivery/shipping arrangement.]
- **Direct payment gateway:** the reviewed implementation does not show a direct payment-gateway API integration. The App includes a GCash reference-number and receipt-upload flow. [CONFIRM WITH PROJECT OWNER: confirm all payment arrangements.]

We do not sell personal information. [CONFIRM WITH PROJECT OWNER: confirm this statement reflects the project’s intended practice before publication.]

## 3. Storage and retention

The A'FRO backend stores account and application data in its database. The reviewed implementation stores application uploads on the server in local upload folders. [CONFIRM WITH PROJECT OWNER: identify the production hosting/storage location and who has administrative access.]

### Account deletion

You can request account deletion from the App by confirming your email address, password, and the deletion instruction shown in the App.

When you request deletion:

1. Your account is deactivated immediately.
2. Your cart items and saved-product entries are deleted.
3. You may reactivate the account by signing in again within 30 days.
4. After 30 days, the implementation replaces the account email with a generated deleted address, clears the phone number, and replaces the password hash.

The implementation does **not** establish an automatic deletion schedule for uploaded files, messages, reviews, orders, payment receipts, virtual try-on results, backups, logs, or other records associated with an account. This policy does not promise that those items are automatically deleted. [CONFIRM WITH PROJECT OWNER: decide and document how these records, files, backups, and logs are retained, anonymized, or deleted after an account-deletion request.]

Outside the account-deletion process above, retention periods are not defined in the reviewed implementation. [CONFIRM WITH PROJECT OWNER: provide retention periods for accounts, orders, receipts, messages, reviews, uploads, try-on data, backups, and logs.]

## 4. Security

We use reasonable technical measures implemented in the project to help protect information, including password hashing, signed authentication tokens, server-side administrator access checks, restricted API origins, rate limiting for authentication-related requests, and sanitized server-error responses.

The planned production design uses HTTPS through Cloudflare Tunnel for the public API. No security method can guarantee absolute security.

Do not state that data is encrypted at rest, certified, compliant with a particular standard, or protected by a specific security program unless that is confirmed. [CONFIRM WITH PROJECT OWNER: confirm production access controls, device security, backup security, encryption-at-rest status, and incident-response contact/process.]

## 5. Your choices and requests

You may be able to:

- review and update certain account, contact, address, preference, and profile information in the App;
- manage notification preferences in the App and on your device;
- request account deletion using the App; and
- contact the project owner to request access to, correction of, or deletion of personal information, subject to applicable requirements and records the project needs to retain.

**Privacy request contact:** [CONFIRM WITH PROJECT OWNER]

## 6. Children and age eligibility

[CONFIRM WITH PROJECT OWNER: state the intended minimum age, whether the App is directed to children, and any parental-consent process.]

## 7. International processing and service-provider links

Some service providers may process information outside your location. [CONFIRM WITH PROJECT OWNER: confirm the countries/regions relevant to the deployed services and add approved provider privacy-policy links.]

Provider privacy-policy links to confirm before publication:

- Brevo: [CONFIRM WITH PROJECT OWNER]
- iProg SMS: [CONFIRM WITH PROJECT OWNER]
- Geoapify: [CONFIRM WITH PROJECT OWNER]
- Google Gemini: [CONFIRM WITH PROJECT OWNER]
- Modal: [CONFIRM WITH PROJECT OWNER]
- Expo: [CONFIRM WITH PROJECT OWNER]
- Cloudflare: [CONFIRM WITH PROJECT OWNER]
- Skin-tone provider, if enabled: [CONFIRM WITH PROJECT OWNER]

## 8. Changes to this policy

We may update this policy when the App, its data practices, or its service providers change. We will identify the effective date of an updated policy. [CONFIRM WITH PROJECT OWNER: decide how users will be notified of material changes.]

## 9. Project-owner review checklist

Before publishing, confirm every item marked `[CONFIRM WITH PROJECT OWNER]`, especially contact details, legal requirements, active providers, provider links, payment/shipping arrangements, age eligibility, data retention, account-deletion scope, upload deletion, backup/log retention, and production security practices.
