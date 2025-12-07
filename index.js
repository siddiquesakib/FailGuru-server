require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const admin = require("firebase-admin");
const port = process.env.PORT || 3000;

const decoded = Buffer.from(process.env.FB_SERVICE_KEY, "base64").toString(
  "utf-8"
);
const serviceAccount = JSON.parse(decoded);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// middleware
const app = express();
// middleware
app.use(
  cors({
    origin: ["http://localhost:5173", "http://localhost:5174"],
    credentials: true,
    optionSuccessStatus: 200,
  })
);
app.use(express.json());

// jwt middlewares
const verifyJWT = async (req, res, next) => {
  const token = req?.headers?.authorization?.split(" ")[1];
  console.log(token);
  if (!token) return res.status(401).send({ message: "Unauthorized Access!" });
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.tokenEmail = decoded.email;
    console.log(decoded);
    next();
  } catch (err) {
    console.log(err);
    return res.status(401).send({ message: "Unauthorized Access!", err });
  }
};

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
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

    // Get all public lessons (anyone can access)
    app.get("/lessons", async (req, res) => {
      const result = await LessonsColl.find().toArray();
      res.send(result);
    });

    // get all plants from db
    app.get("/lessons/:id", async (req, res) => {
      const id = req.params.id;
      const result = await LessonsColl.findOne({ _id: new ObjectId(id) });
      res.send(result);
    });

    // Get single lesson by ID (protected route - need login)
    app.get("/lessons/:id", verifyJWT, async (req, res) => {
      // CHANGE: Added verifyJWT middleware
      try {
        const id = req.params.id;
        const result = await LessonsColl.findOne({ _id: new ObjectId(id) });
        if (!result) {
          return res.status(404).send({ message: "Lesson not found" });
        }
        res.send(result);
      } catch (err) {
        res.status(500).send({ message: "Server error", err });
      }
    });

    app.post("/lessons", async (req, res) => {
      const lessonsData = req.body;
      const result = await LessonsColl.insertOne(lessonsData);
      res.send(result);
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("server is running!");
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
