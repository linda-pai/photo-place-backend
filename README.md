# Photo Place Backend

Backend API for PHOTO PACER, a race-photo platform. Photographers upload race photos, the system detects bib numbers with AWS Rekognition and adds watermarks, runners find their photos by bib number, and they buy the originals through LINE Pay or NewebPay.

## 📋 Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Authentication](#authentication)
- [API Reference](#api-reference)
- [Data Model](#data-model)
- [Core Flows](#core-flows)
- [Deployment](#deployment)
- [Troubleshooting](#troubleshooting)
- [Known Issues & TODO](#known-issues--todo)

---

## Features

- **Event management**: list, create (with an optional cover image), update and delete events. Supports private albums (`isPrivate`).
- **Photo upload**: S3 multipart upload. The frontend uploads directly to S3 with presigned URLs, and the backend records upload progress.
- **Bib detection**: AWS Rekognition `DetectText` reads bib numbers and stores them in each photo's `path` field for search.
- **Watermarking**: Sharp composites the watermark and saves a second copy to S3. Private albums get no platform watermark, so their photos can be downloaded directly (free photos).
- **Photo search**: filter by bib number, photographer, category (all / featured / unidentified) and capture time range. Results are paginated at 12 photos per page.
- **Orders & payments**: LINE Pay and NewebPay. A successful payment sends an order confirmation email to the buyer and a sale notification to the photographer.
- **Photographer dashboard**: upload stats, sales info, custom watermarks, featured photos (up to 400 per photographer per event), bib corrections and display names.
- **CMS (admin)**: upload info, user and order management, "photos uploaded" notification emails, and photo deletion.
- **Other**: photo reporting, subscriptions to an event's upload-complete notification, GIF generation from purchased photos, and automatic updates to the MongoDB Atlas IP access list.

---

## Tech Stack

| Category         | Technology                                                                 |
| ---------------- | -------------------------------------------------------------------------- |
| Runtime          | Node.js 18, Express 4, Node `cluster` (one worker per CPU core)            |
| Database         | MongoDB (`mongodb` driver v4), database name `photopacerdb`                |
| Cloud            | AWS S3 (`@aws-sdk/client-s3`, `s3-request-presigner`), AWS Rekognition     |
| Image processing | Sharp (watermarks, orientation), gifencoder (GIFs), Multer (form uploads)  |
| Payments         | LINE Pay v3 API, NewebPay MPG (AES + SHA256)                               |
| Email            | Nodemailer + Gmail OAuth2 (`googleapis`)                                   |
| Utilities        | dotenv, dayjs, js-sha256, crypto-js, axios, urllib                         |

---

## Project Structure

```
.
├── server.js                    # Entry point: cluster, CORS, route registration, MongoDB connection
├── Dockerfile                   # Production image (node:18-alpine, sharp built for linux-musl-arm64)
├── Dockerfile.dev               # Development image
└── src/
    ├── assets/                  # Platform watermark PNGs
    ├── database/mongoUtil.js    # MongoDB connection and shared db instance
    ├── lib/constants.js         # Constants: IMAGE_STATUS, PAYMENT_METHOD, REPORT_TYPE_TRANS, …
    ├── middleware/
    │   ├── authChecker.js       # User authentication
    │   └── adminChecker.js      # Admin authentication
    ├── modules/
    │   ├── uploadModules.js           # S3 upload, multipart upload, presigned URLs
    │   ├── detectText.js              # Rekognition bib detection
    │   ├── detectAndWatermarkQueue.js # Batch detection + watermarking (10 photos per batch)
    │   ├── watermark/                 # Watermark compositing
    │   ├── getImageModules.js         # Shared photo query logic
    │   ├── gifModules.js              # GIF generation
    │   ├── emailSender.js             # Email sending
    │   ├── linePay/                   # LINE Pay signing, request, confirm
    │   ├── newebpay/                  # NewebPay encryption/decryption
    │   ├── order/                     # Order creation, payment updates, notifications
    │   ├── photographer/              # Photographer logic
    │   └── progress/                  # Upload progress
    └── routes/                  # API routes (see API Reference)
```

---

## Getting Started

### Prerequisites

- Node.js 18 (matches the Dockerfile)
- Yarn (the project uses `yarn.lock`)
- MongoDB (MongoDB Atlas recommended)
- An AWS account with an S3 bucket and Rekognition access
- LINE Pay and NewebPay merchant accounts (sandbox works for testing)
- A Gmail account with Google OAuth2 credentials (for sending email)

### Setup

```bash
git clone <repository-url>
cd photo-place-backend
yarn install

# Create the env file for your NODE_ENV (see "Environment Variables")
touch .env.development

# Development (nodemon hot reload, NODE_ENV=development)
yarn dev

# Production (NODE_ENV must be set yourself)
NODE_ENV=production yarn start
```

The server always listens on `http://localhost:3001`, and every API path is prefixed with `/api`.

> ⚠️ The env file is loaded from `.env.${NODE_ENV}`. If `NODE_ENV` is not set, the app reads `.env.undefined` and every setting is empty.

---

## Environment Variables

Create `.env.development` / `.env.production` in the project root. Both are in `.gitignore`. **Never commit them.**

```bash
# ── MongoDB ──────────────────────────────
MONGO_CONNECTION_STRING=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/

# MongoDB Atlas Admin API (used by /api/mongodb/ip-update to add IPs to the access list)
MONGODB_API_PUBLIC_KEY=
MONGODB_API_PRIVATE_KEY=
MONGODB_GROUP_ID=
MONGODB_ORG_ID=
MONGODB_API_KEY_ID=

# ── CORS allowlist / frontend URLs ───────
CLIENT_DOMAIN=https://example.com
CLIENT_WWW_DOMAIN=https://www.example.com

# ── Auth ─────────────────────────────────
SALT=<random string, must match the frontend>
ADMIN_ID=<admin userId>
ADMIN_PP_ID=<platform's official photographer userId>

# ── AWS ──────────────────────────────────
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=ap-northeast-1
AWS_BUCKET_NAME=<bucket-name>
AWS_BUCKET_URL=https://<bucket-name>.s3.<region>.amazonaws.com
AWS_BUCKET_PREFIX=/dev          # S3 key prefix, e.g. /dev or /prod
AWS_URL_EXPIRATION=1200         # Presigned URL lifetime in seconds (default 1200)

# ── NewebPay ─────────────────────────────
MerchantID=
HASHKEY=
HASHIV=
Version=2.0
ReturnUrl=<frontend URL to return to after payment>
NotifyUrl=<NewebPay server notification URL, pointing to /api/newebpay/notify>
NEWEBPAY_PGW_URL=https://ccore.newebpay.com/MPG/mpg_gateway   # sandbox

# ── LINE Pay ─────────────────────────────
LINE_PAY_SITE=https://sandbox-api-pay.line.me                 # sandbox
LINE_PAY_CHANNEL_ID=
LINE_PAY_CHANNEL_SECRET=
LINE_PAY_CONFIRM_URL=<frontend URL to return to after payment>
LINE_PAY_CANCEL_URL=<frontend URL to return to after cancellation>

# ── Email (Gmail OAuth2) ─────────────────
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
MAILER_REFRESH_TOKEN=
MAILER_FROM_USER=<sender Gmail address>
EMAIL_PREFIX=[DEV]              # Subject prefix to tell environments apart
```

---

## Authentication

The API does not use JWT. It uses a simple "SHA256 of token + SALT" check, with values sent by the frontend in headers:

| Middleware     | Applied to                          | Check                                                                                  |
| -------------- | ----------------------------------- | -------------------------------------------------------------------------------------- |
| `authChecker`  | `/api/orders`, `/api/photographer`  | `Authorization: Bearer <token>`, and the `secret` header must equal `sha256(token + SALT)` |
| `adminChecker` | `/api/cms`                          | The `secret` header must equal `sha256(ADMIN_ID + SALT)` or `sha256(ADMIN_PP_ID + SALT)`  |

A failed check returns `401 { error: "Unauthorized" }`. The other routes (events, images, upload, payments, …) currently have no middleware.

CORS only allows `CLIENT_DOMAIN`, `CLIENT_WWW_DOMAIN`, and requests without an `Origin` header (such as server-to-server payment notifications).

---

## API Reference

🔒 = requires `authChecker`　👑 = requires `adminChecker`

### Events `/api/events`

| Method | Path                         | Description                                          |
| ------ | ---------------------------- | ---------------------------------------------------- |
| GET    | `/eventList`                 | Event list                                           |
| GET    | `/getAllEvents`              | All events                                           |
| GET    | `/getEventOptions`           | Event options for dropdowns (includes `isPrivate`)   |
| GET    | `/getBy/:eventId`            | Single event                                         |
| GET    | `/getPhotographers/:eventId` | Photographers for the event                          |
| POST   | `/add`                       | Create an event (`multipart/form-data`, field `file`) |
| PUT    | `/update/:eventId`           | Update an event                                      |
| DELETE | `/delete/:eventId`           | Delete an event                                      |

### Images `/api/images`

| Method | Path                               | Description                                                       |
| ------ | ---------------------------------- | ----------------------------------------------------------------- |
| GET    | `/getByPathAndEventId/:eventId`    | Search photos. Query: `path`, `author`, `category`, `lastModified`, `page` |
| POST   | `/getByLastModified/:eventId`      | Query by capture time                                             |
| GET    | `/getByIds/:eventId/:ids`          | Get photos by multiple ids                                        |
| GET    | `/getUrlById/:eventId/:id`         | Get the original URL (direct download for free / private-album photos) |
| POST   | `/updateWatermarkUrlAndDetectText` | Batch bib detection + watermarking for unprocessed photos, then sets `isCompleteUpload` |
| POST   | `/singleImgS3Upload`               | Upload a single file straight to S3 (`file`, `path`)              |

`getByPathAndEventId` parameters:

- `path`: bib number (partial match)
- `author`: photographer userId
- `category`: see `IMAGE_STATUS`: `1` all, `3` featured, `4` unidentified, `5` more
- `lastModified`: `start,end`, two timestamps separated by a comma (parsed in the Asia/Taipei time zone)
- `page`: page number, default 1, 12 photos per page

### Upload `/api/upload`

| Method | Path                      | Description                                                    |
| ------ | ------------------------- | -------------------------------------------------------------- |
| POST   | `/start-upload`           | Create an S3 multipart upload; returns `uploadId` and `key`    |
| GET    | `/get-upload-url`         | Presigned URL for one part (`partNumber`, `uploadId`, `key`)   |
| POST   | `/complete-upload`        | Complete the multipart upload and write to `imagecollection/{eventId}` |
| POST   | `/addWatermark`           | Single photo: detection + watermark + DB write                 |
| POST   | `/writeUploadInfo`        | Record a photographer's upload info for an event               |
| POST   | `/write-upload-progress`  | Write upload progress                                          |
| POST   | `/remove-upload-progress` | Remove upload progress                                         |

### Progress `/api/progress`

| Method | Path                   | Description                                  |
| ------ | ---------------------- | -------------------------------------------- |
| GET    | `/get-upload-progress` | Get progress (query: `eventId`, `author`)    |

### User `/api/user`

| Method | Path            | Description                                       |
| ------ | --------------- | ------------------------------------------------- |
| POST   | `/createUser`   | Create a user; updates the token if the user exists |
| POST   | `/notifyRecord` | Subscribe to an event's "photos uploaded" email   |
| POST   | `/reportImage`  | Report a photo (types in `REPORT_TYPE_TRANS`)     |

### Orders `/api/orders` 🔒

| Method | Path                       | Description                            |
| ------ | -------------------------- | -------------------------------------- |
| POST   | `/getByUser`               | The user's orders                      |
| POST   | `/getByEventIdAndImageIds` | Purchased photos                       |
| POST   | `/generateGif`             | Build a GIF from purchased photos      |
| POST   | `/eventListByUserOrder`    | Events the user has bought photos from |

### Payments

| Method | Path                    | Description                                                              |
| ------ | ----------------------- | ------------------------------------------------------------------------ |
| POST   | `/api/linepay/request`  | Create the order and request a payment URL from LINE Pay                 |
| POST   | `/api/linepay/confirm`  | Confirm the transaction after payment, update the order, send emails     |
| POST   | `/api/newebpay/request` | Create the order and return the encrypted `TradeInfo` / `TradeSha` plus the gateway URL |
| POST   | `/api/newebpay/decrypt` | Decrypt `TradeInfo` so the frontend can show the payment result          |
| POST   | `/api/newebpay/notify`  | NewebPay server notification (NotifyUrl): verify SHA, update the order, send emails |

Both `request` endpoints first check whether the `orderId` is already paid and return `{ status: "paid" }` if so.

### Photographer `/api/photographer` 🔒

| Method | Path                                       | Description                                                  |
| ------ | ------------------------------------------ | ------------------------------------------------------------ |
| POST   | `/getUploadInfo`                           | The photographer's upload records                            |
| POST   | `/getByAuthor`                             | The photographer's photos                                    |
| GET    | `/getByStatus/:eventId/:author`            | Photos by featured / removed status                          |
| POST   | `/setStatus/:eventId/:imageId/:author`     | Set featured (`isFeatured`, max 400) or removed (`isRemoved`) |
| POST   | `/updateBibs`                              | Manually correct a photo's bib numbers                       |
| GET    | `/getDetectedImageLength/:eventId/:author` | Number of photos with detected bibs                          |
| POST   | `/getSoldInfoByAuthor/:eventId`            | Sales info                                                   |
| GET    | `/getWatermark/:author`                    | Get the custom watermark                                     |
| POST   | `/uploadWatermark`                         | Upload a custom watermark                                    |
| POST   | `/generateWatermark`                       | Generate watermarked photos                                  |
| POST   | `/getFeaturedWatermarkImages`              | Watermarked versions of featured photos                      |
| POST   | `/deleteWatermark`                         | Delete the custom watermark                                  |
| POST   | `/setDisplayName`                          | Set display name                                             |
| GET    | `/getDisplayName/:author`                  | Get display name                                             |

### CMS `/api/cms` 👑

| Method | Path                              | Description                                         |
| ------ | --------------------------------- | --------------------------------------------------- |
| GET    | `/getUploadInfo`                  | All upload info                                     |
| GET    | `/getUploadInfo/:eventId`         | Upload info for one event                           |
| POST   | `/getImageInfoByEventId/:eventId` | Photo info for one event                            |
| GET    | `/notifyRecord/:eventId`          | Subscribers for the event's notification            |
| POST   | `/sendEmail`                      | Send a single notification email                    |
| POST   | `/sendAllEmail/:eventId`          | Send the "photos uploaded" email to all subscribers |
| GET    | `/userList`                       | User list                                           |
| GET    | `/orderList`                      | Order list                                          |
| PUT    | `/updateOrder/:orderId`           | Update an order                                     |
| POST   | `/deleteOrder/:orderId`           | Delete an order                                     |
| POST   | `/deleteImages`                   | Delete photos                                       |

### MongoDB `/api/mongodb`

| Method | Path         | Description                                                                          |
| ------ | ------------ | ------------------------------------------------------------------------------------ |
| POST   | `/ip-update` | Add `instanceIp` to the Atlas project and API key IP access lists (for auto scaling) |

---

## Data Model

Database: `photopacerdb`

| Collection                  | Purpose                                                                  |
| --------------------------- | ------------------------------------------------------------------------ |
| `eventlistcollection`       | Events: `eventId`, `eventName`, `date`, `isShow`, `isPrivate`, `isCompleteUpload`, `isReviewed`, … |
| `imagecollection/{eventId}` | **One collection per event**, holding all of that event's photos         |
| `usercollection`            | Users: `userId`, `email`, `token`, `role`, `createTime`                  |
| `ordercollection`           | Orders: `orderId`, `orderBy`, `items`, `totalAmount`, `paymentMethod`, `paidAt` |
| `uploadInfocollection`      | A photographer's upload / sales info per event (`author` + `eventId`)    |
| `progresscollection`        | Upload progress                                                          |
| `photographercollection`    | Photographer settings (watermark, display name)                          |
| `notifycollection`          | Subscriptions to upload-complete notifications                           |
| `reportcollection`          | Photo reports                                                            |
| `rolescollection`           | Roles (the `roles` route is currently disabled)                          |

Photo document shape (`imagecollection/{eventId}`):

```js
{
  path: ["1234", "A001"],          // Bib numbers detected by Rekognition
  isFeatured: false,               // Featured
  isRemoved: false,                // Removed by the photographer
  image: {
    id: "img-<uuid>",
    url: "<S3 original URL>",
    watermarkedUrl: "<S3 watermarked URL>",
    orientation: "horizontal" | "vertical" | "square",
    fileName, price, eventId, eventName,
    author, authorName, lastModified,
  },
}
```

Constants (`src/lib/constants.js`):

```js
PAYMENT_METHOD = { LINE_PAY: 2, NEWEB_PAY: 3 }
IMAGE_STATUS   = { ALL: "1", IDENTIFYED: "3", UNIDENTIFYED: "4", MORE: "5" }
REMOVE_IMAGE_STATUS = { REMOVE: "1", REPORTED: "2", FEATURED: "3" }
```

S3 key format: `images${AWS_BUCKET_PREFIX}/{eventId}/{sha256}-{fileName}`. Watermarked copies are named `watermarked-{fileName}`.

---

## Core Flows

### Photo upload

```
Frontend                            Backend                        AWS
 │ POST /upload/start-upload  ────▶ CreateMultipartUpload ───────▶ S3
 │ GET  /upload/get-upload-url ───▶ presigned URL (per part)
 │ PUT  part ────────────────────────────────────────────────────▶ S3 (direct)
 │ POST /upload/complete-upload ──▶ CompleteMultipartUpload ─────▶ S3
 │                                  insert into imagecollection (path: [])
 │                                  update uploadInfocollection
 │ POST /images/updateWatermarkUrlAndDetectText
 │                                  find photos without watermarkedUrl, 10 per batch:
 │                                   ├─ Rekognition DetectText ──▶ path
 │                                   └─ Sharp watermark ─────────▶ S3
 │                                  set event isCompleteUpload = true
```

- With `isPrivate = true` (private album), no platform watermark is applied, and `/images/getUrlById` returns the original for direct download.
- After uploading, an admin can notify subscribers from the CMS with `/cms/sendAllEmail/:eventId`.

### Payment

```
LINE Pay                                   NewebPay
POST /linepay/request                      POST /newebpay/request
  ├─ check if already paid                   ├─ check if already paid
  ├─ createOrder (paidAt = null)             ├─ AES-encrypt TradeInfo + SHA256 TradeSha
  └─ return payment URL → user pays          ├─ createOrder (paidAt = null)
POST /linepay/confirm                        └─ frontend form-POSTs to NEWEBPAY_PGW_URL
  ├─ confirm with LINE Pay                 POST /newebpay/notify (server notification)
  └─ on success ↓                            ├─ decrypt and verify SHA
                                             └─ on success ↓
        updateOrderPaidAt → updateUploadInfoSellInfo → send order / sale emails
```

### Cluster

`server.js` runs a master process that forks one worker per CPU core and restarts any worker that dies. Each worker opens its own MongoDB connection and listens on port 3001.

---

## Deployment

```bash
# Production (note: the Dockerfile installs sharp with --cpu=arm64, for ARM hosts such as AWS Graviton)
docker build -t photo-place-backend .
docker run -p 3001:3001 --env-file .env.production photo-place-backend

# Development
docker build -f Dockerfile.dev -t photo-place-backend:dev .
docker run -p 3001:3001 --env-file .env.development photo-place-backend:dev
```

- `.dockerignore` does not exclude `.env.*`, so env files are copied into the image at build time. If you inject them with `--env-file`, add `.env*` to `.dockerignore`.
- With auto scaling, a new instance can call `POST /api/mongodb/ip-update` on startup to add its IP to the Atlas access list.
- Payment callback URLs (`NotifyUrl`, `LINE_PAY_CONFIRM_URL`, etc.) must be publicly reachable over HTTPS.

### Minimal AWS IAM policy

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject",
        "s3:AbortMultipartUpload",
        "s3:ListMultipartUploadParts"
      ],
      "Resource": "arn:aws:s3:::<bucket-name>/*"
    },
    {
      "Effect": "Allow",
      "Action": ["rekognition:DetectText"],
      "Resource": "*"
    }
  ]
}
```

---

## Troubleshooting

| Symptom                                    | Likely cause                                                               |
| ------------------------------------------ | -------------------------------------------------------------------------- |
| Every setting is `undefined`               | `NODE_ENV` is not set, or `.env.${NODE_ENV}` does not exist                |
| `Cannot read properties of undefined (reading 'db')` on startup | MongoDB connection failed: check `MONGO_CONNECTION_STRING` and the Atlas IP access list |
| Frontend requests blocked by CORS          | The frontend domain is not `CLIENT_DOMAIN` / `CLIENT_WWW_DOMAIN`           |
| `/orders` or `/photographer` returns 401   | Missing `Authorization` or `secret` header, or `SALT` differs between frontend and backend |
| `/cms` returns 401                         | `secret` does not equal `sha256(ADMIN_ID + SALT)`                          |
| Photos have no bib numbers or watermark    | `/images/updateWatermarkUrlAndDetectText` was not called, or Rekognition permission is missing |
| sharp fails to load in Docker              | Image architecture does not match the host (the Dockerfile targets arm64)  |
| Emails fail to send                        | The Gmail OAuth2 refresh token expired; regenerate `MAILER_REFRESH_TOKEN`  |
| NewebPay notification does not update the order | Wrong `HASHKEY` / `HASHIV` fails the SHA check, or `NotifyUrl` is not publicly reachable |

---

## Known Issues & TODO

- `uuid` is used in code but not listed in `package.json` dependencies (it is currently installed transitively). Add it with `yarn add uuid`.
- The CORS option in `server.js` is misspelled `oprtionsSuccessStatus` (should be `optionsSuccessStatus`).
- Several events, images and upload routes have no auth middleware.
- `EMAIL_PREFIX` is commented out in the order emails (see the TODO in `orderModules.js`).
- Private albums currently just skip the watermark; this could become a photographer-defined watermark (see the TODO in `drawWatermark.js`).
- No automated tests (`yarn test` is not implemented).
