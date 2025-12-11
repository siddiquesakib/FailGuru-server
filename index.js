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
    const favoritesColl = db.collection("favorites");
    const reportsColl = db.collection("Reports");
    const commentsColl = db.collection("comments");

    //get all lessons
    app.get("/lessons", async (req, res) => {
      const result = await LessonsColl.find().toArray();
      res.send(result);
    });

    //get lessons by id
    app.get("/lessons/:id", async (req, res) => {
      const id = req.params.id;
      const result = await LessonsColl.findOne({ _id: new ObjectId(id) });
      if (!result) {
        return res.status(404).send({ message: "Lesson not found" });
      }
      res.send(result);
    });

    //post lessons
    app.post("/lessons", async (req, res) => {
      try {
        const lessonsData = req.body;
        const creatorEmail = lessonsData.creatorEmail; // Get email from lesson data

        // Insert the lesson
        const result = await LessonsColl.insertOne(lessonsData);

        // Increment user's totalLessonsCreated
        await userColl.updateOne(
          { email: creatorEmail },
          { $inc: { totalLessonsCreated: 1 } }
        );

        res.send({ success: true, result });
      } catch (err) {
        console.log(err);
        res.status(500).send({ error: "Failed to create lesson" });
      }
    });

    //users data
    app.post("/users", async (req, res) => {
      const userData = req.body;

      userData.role = "user";
      userData.isPremium = false;
      userData.totalLessonsCreated = 0;
      userData.totalLessonsSaved = 0;
      userData.createdAt = new Date().toISOString();
      userData.updatedAt = new Date().toISOString();

      const query = { email: userData.email };
      const alreadyHere = await userColl.findOne(query);

      if (alreadyHere) {
        // Already exists - just update login time
        const result = await userColl.updateOne(query, {
          $set: { updatedAt: new Date().toISOString() },
        });
        return res.send(result);
      }
      const result = await userColl.insertOne(userData);
      res.send(result);
    });

    //get all users
    app.get("/users", async (req, res) => {
      const user = await userColl.find().toArray();
      res.send(user);
    });

    //get users by email
    app.get("/users/:email", async (req, res) => {
      const email = req.params.email;
      const user = await userColl.findOne({ email: email });
      res.send(user);
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
        return res.send({ message: "Invalid email" });
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

    // cancle user to premium to user
    app.patch("/users/premium/cancel/:email", async (req, res) => {
      const email = req.params.email;

      const result = await userColl.updateOne(
        { email: email },
        { $set: { isPremium: false } }
      );

      res.send(result);
    });

    //get lessons by email
    app.get("/my-lessons", async (req, res) => {
      const email = req.query.email;
      const query = {};
      if (email) {
        query.creatorEmail = email;
      }
      const result = await LessonsColl.find(query).toArray();
      res.send(result);
    });

    //delete my lessons
    app.delete("/my-lessons/:id", async (req, res) => {
      try {
        const { id } = req.params;
        const objectid = new ObjectId(id);
        const result = await LessonsColl.deleteOne({ _id: objectid });

        res.send(result);

        // Decrement user's totalLessonsCreate
        await userColl.updateOne(
          { email: userEmail },
          { $inc: { totalLessonsCreated: -1 } }
        );

        res.send({ success: true });
      } catch (err) {
        console.log(err);
      }
    });

    //update
    app.patch("/my-lessons/:id", async (req, res) => {
      const { id } = req.params;
      const objectid = new ObjectId(id);
      const updateData = req.body;

      const update = {
        $set: {
          title: updateData.title,
          description: updateData.description,
          category: updateData.category,
          emotionalTone: updateData.emotionalTone,
          image: updateData.image,
          privacy: updateData.privacy,
          accessLevel: updateData.accessLevel,
          updatedDate: new Date().toISOString(),
        },
      };

      const result = await LessonsColl.updateOne({ _id: objectid }, update);
      res.send(result);
    });

    // Add to favorites
    app.post("/favorites", async (req, res) => {
      const {
        userEmail,
        lessonId,
        lessonTitle,
        lessonImage,
        lessonCategory,
        lessonTone,
      } = req.body;

      try {
        // Check if already favorited
        const existing = await favoritesColl.findOne({ userEmail, lessonId });
        if (existing) {
          return res.send({ message: "Already in favorites" });
        }

        // 1. Add to favorites collection
        const favoriteData = {
          userEmail,
          lessonId: new ObjectId(lessonId),
          lessonTitle,
          lessonImage,
          lessonCategory,
          lessonTone,
          createdAt: new Date().toISOString(),
        };
        const result = await favoritesColl.insertOne(favoriteData);

        // 2. Increment lesson's favoritesCount
        await LessonsColl.updateOne(
          { _id: new ObjectId(lessonId) },
          { $inc: { favoritesCount: 1 } }
        );

        // 3. Increment user's totalLessonsSaved
        await userColl.updateOne(
          { email: userEmail },
          { $inc: { totalLessonsSaved: 1 } }
        );

        res.send({ success: true, result });
      } catch (error) {
        console.error(error);
        res.send({ error: "Failed to add favorite" });
      }
    });

    // Remove from favorites
    app.delete("/favorites/:lessonId", async (req, res) => {
      const { lessonId } = req.params;
      const { userEmail } = req.query;

      try {
        // 1. Remove from favorites collection
        const result = await favoritesColl.deleteOne({
          userEmail,
          lessonId: new ObjectId(lessonId),
        });

        if (result.deletedCount === 0) {
          return res.send({ message: "Favorite not found" });
        }

        // 2. Decrement lesson's favoritesCount
        await LessonsColl.updateOne(
          { _id: new ObjectId(lessonId) },
          { $inc: { favoritesCount: -1 } }
        );

        // 3. Decrement user's totalLessonsSaved
        await userColl.updateOne(
          { email: userEmail },
          { $inc: { totalLessonsSaved: -1 } }
        );

        res.send({ success: true });
      } catch (error) {
        console.error(error);
        res.status(500).send({ error: "Failed to remove favorite" });
      }
    });

    // Get user's favorites
    app.get("/favorites", async (req, res) => {
      const { email } = req.query;

      const result = await favoritesColl
        .find({ userEmail: email })
        .sort({ createdAt: -1 })
        .toArray();

      res.send(result);
    });

    // Check if lesson is favorited by user
    app.get("/favorites/check/:lessonId", async (req, res) => {
      const { lessonId } = req.params;
      const { email } = req.query;

      const result = await favoritesColl.findOne({
        userEmail: email,
        lessonId: new ObjectId(lessonId),
      });

      res.send({ isFavorited: !!result });
    });

    app.patch("/lessons/:id/like", async (req, res) => {
      try {
        const lessonId = req.params.id;
        const { userEmail } = req.body; // send { userEmail } from client
        if (!userEmail)
          return res.status(400).send({ message: "Missing userEmail" });

        const objectId = new ObjectId(lessonId);

        // Get current doc
        const lesson = await LessonsColl.findOne({ _id: objectId });
        if (!lesson)
          return res.status(404).send({ message: "Lesson not found" });

        const alreadyLiked =
          Array.isArray(lesson.likes) && lesson.likes.includes(userEmail);

        const update = alreadyLiked
          ? { $pull: { likes: userEmail }, $inc: { likesCount: -1 } }
          : { $addToSet: { likes: userEmail }, $inc: { likesCount: 1 } };

        await LessonsColl.updateOne({ _id: objectId }, update);

        const updated = await LessonsColl.findOne({ _id: objectId });
        res.send(updated);
      } catch (err) {
        console.error("Toggle like error:", err);
        res.status(500).send({ error: "Failed to toggle like" });
      }
    });

    // Add Report Route
    app.post("/reports", async (req, res) => {
      const { lessonId, lessonTitle, reporterEmail, reporterName, reason } =
        req.body;

      try {
        // Check if user already reported this lesson
        const existingReport = await reportsColl.findOne({
          lessonId: new ObjectId(lessonId),
          reporterEmail: reporterEmail,
        });

        if (existingReport) {
          return res
            .status(400)
            .send({ message: "You have already reported this lesson" });
        }

        const reportData = {
          lessonId: new ObjectId(lessonId),
          lessonTitle,
          reporterEmail,
          reporterName,
          reason,
          status: "pending",
          timestamp: new Date().toISOString(),
        };

        const result = await reportsColl.insertOne(reportData);
        res.send({ success: true, result });
      } catch (error) {
        console.error(error);
        res.status(500).send({ error: "Failed to submit report" });
      }
    });

    // Get all reports
    app.get("/reports", async (req, res) => {
      const result = await reportsColl.find().sort({ timestamp: -1 }).toArray();
      res.send(result);
    });

    // Get reports for a specific lesson
    app.get("/reports/lesson/:lessonId", async (req, res) => {
      const { lessonId } = req.params;

      const result = await reportsColl
        .find({ lessonId: new ObjectId(lessonId) })
        .sort({ timestamp: -1 })
        .toArray();

      res.send(result);
    });

    // Update report status (for admin)
    app.patch("/reports/:reportId", async (req, res) => {
      const { reportId } = req.params;
      const { status } = req.body; // "pending", "ignored", "resolved"

      try {
        const result = await reportsColl.updateOne(
          { _id: new ObjectId(reportId) },
          { $set: { status, updatedAt: new Date().toISOString() } }
        );

        if (result.matchedCount === 0) {
          return res.status(404).send({ message: "Report not found" });
        }

        res.send({ success: true, result });
      } catch (error) {
        console.error(error);
        res.status(500).send({ error: "Failed to update report" });
      }
    });

    // Post a comment
    app.post("/comments", async (req, res) => {
      const { lessonId, userEmail, userName, userPhoto, comment } = req.body;

      try {
        const commentData = {
          lessonId: new ObjectId(lessonId),
          userEmail,
          userName,
          userPhoto,
          comment,
          createdAt: new Date().toISOString(),
        };

        const result = await commentsColl.insertOne(commentData);
        res.send({ success: true, result });
      } catch (error) {
        console.error(error);
        res.status(500).send({ error: "Failed to post comment" });
      }
    });

    // Get comments for a lesson
    app.get("/comments/:lessonId", async (req, res) => {
      const { lessonId } = req.params;

      const result = await commentsColl
        .find({ lessonId: new ObjectId(lessonId) })
        .sort({ createdAt: -1 })
        .toArray();

      res.send(result);
    });

    app.get("/comments", async (req, res) => {
      const result = await commentsColl.find().toArray();
      res.send(result);
    });

    // Delete comment (only by comment owner)
    app.delete("/comments/:commentId", async (req, res) => {
      const { commentId } = req.params;
      const { userEmail } = req.query;

      try {
        const comment = await commentsColl.findOne({
          _id: new ObjectId(commentId),
        });

        if (!comment) {
          return res.status(404).send({ message: "Comment not found" });
        }

        if (comment.userEmail !== userEmail) {
          return res.status(403).send({ message: "Unauthorized" });
        }

        const result = await commentsColl.deleteOne({
          _id: new ObjectId(commentId),
        });

        res.send({ success: true, result });
      } catch (error) {
        console.error(error);
        res.status(500).send({ error: "Failed to delete comment" });
      }
    });

    // Get user role by email
    app.get("/user/role/:email", async (req, res) => {
      try {
        const email = req.params.email;
        const user = await userColl.findOne({ email: email });
        if (!user) {
          return res.status(404).send({ role: "user" });
        }
        res.send({ role: user.role || "user" });
      } catch (err) {
        console.log(err);
        res.status(500).send({ role: "user" });
      }
    });

    //update user to admin
    app.patch("/users/update/admin/:email", async (req, res) => {
      try {
        const email = req.params.email;
        const result = await userColl.updateOne(
          { email: email },
          { $set: { role: "admin" } }
        );
        res.send(result);
      } catch (err) {
        console.log(err);
      }
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
