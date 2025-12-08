require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const admin = require("firebase-admin");
const stripe = require("stripe")(process.env.STRIPE_SECRECT_KEY);
const port = process.env.PORT || 3000;

const decoded = Buffer.from(process.env.FB_SERVICE_KEY, "base64").toString(
  "utf-8"
);
const serviceAccount = JSON.parse(decoded);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// Express App
const app = express();

app.use(
  cors({
    origin: [process.env.CLIENT_DOMAIN],
    credentials: true,
    optionSuccessStatus: 200,
  })
);
app.use(express.json());

// JWT Middleware
const verifyJWT = async (req, res, next) => {
  const token = req?.headers?.authorization?.split(" ")[1];

  if (!token) return res.status(401).send({ message: "Unauthorized Access!" });
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.tokenEmail = decoded.email;
    next();
  } catch (err) {
    return res.status(401).send({ message: "Unauthorized Access!", err });
  }
};

// MongoDB Setup
const client = new MongoClient(process.env.MONGODB_URI, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});
async function run() {
  try {
    const db = client.db("fail_guru_lesson");
    const LessonsColl = db.collection("All_lessons");
    const userColl = db.collection("Users");

    app.get("/lessons", async (req, res) => {
      const result = await LessonsColl.find().toArray();
      res.send(result);
    });

    app.get("/lessons/:id", async (req, res) => {
      const id = req.params.id;
      const result = await LessonsColl.findOne({ _id: new ObjectId(id) });
      if (!result) {
        return res.status(404).send({ message: "Lesson not found" });
      }
      res.send(result);
    });

    app.post("/lessons", async (req, res) => {
      const lessonsData = req.body;
      const result = await LessonsColl.insertOne(lessonsData);
      res.send(result);
    });

    //users data
    app.post("/users", async (req, res) => {
      const userData = req.body;
      const result = await userColl.insertOne(userData);
      res.send(result);
    });

    app.get("/users", async (req, res) => {
      const result = await userColl.find().toArray();
      res.send(result);
    });

    //payment method
    app.post("/create-checkout-session", async (req, res) => {
      const paymentInfo = req.body;
      console.log(paymentInfo);

      try {
        const session = await stripe.checkout.sessions.create({
          line_items: [
            {
              price_data: {
                currency: "usd",
                unit_amount: 11.79 * 100,
                product_data: {
                  name: `Your Name ${paymentInfo?.name}`,
                },
              },
              quantity: 1,
            },
          ],
          mode: "payment",
          success_url: `${process.env.CLIENT_DOMAIN}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
        });
        res.send({ url: session.url });
      } catch (err) {
        console.log(err);
        res.send("dd");
      }
    });

    // Update user to premium
    app.patch("/users/premium/:email", async (req, res) => {
      const email = req.params.email;

      if (!email || email === "undefined") {
        return res.status(400).send({ message: "Invalid email" });
      }

      const result = await userColl.updateOne(
        { email: email },
        { $set: { isPremium: true } }
      );

      if (result.matchedCount === 0) {
        return res.status(404).send({ message: "User not found" });
      }

      res.send(result);
    });

    // Ping DB
    await client.db("admin").command({ ping: 1 });
    console.log("MongoDB connected successfully!");
  } finally {
    // No auto-close (keeps server running)
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("server is running!");
});

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
