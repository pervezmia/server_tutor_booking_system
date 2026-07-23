const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

const port = process.env.PORT || 9000;

// db name = tutor_booking_system

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const { createRemoteJWKSet, jwtVerify } = require("jose-cjs");
const uri = process.env.MONGO_DB_URI;

const JWKS = createRemoteJWKSet(
  new URL(`${process.env.CLIENT_URL}/api/auth/jwks`),
);

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

const logger = (req, res, next) => {
  console.log(`${req.method} | ${req.url}`);
  next();
};

const verifyToken = async (req, res, next) => {
  const { authorization } = req.headers;
  // console.log(req.headers, "form verify token!");
  const token = authorization?.split(" ")[1];
  // console.log(token);
  if (!token) {
    return res.status(401).json({ message: "Unauthorize" });
  }

  try {
    const JWKS = createRemoteJWKSet(
      new URL(`${process.env.CLIENT_URL}/api/auth/jwks`),
    );
    const { payload } = await jwtVerify(token, JWKS);
    // console.log(payload);
    req.user = payload;
    console.log(req.user);
    next();
  } catch (error) {
    console.error("Token validation failed:", error);
    return res.status(401).json({ message: "Unauthorize" });
  }
};

// async function run() {
//   try {
//     // Connect the client to the server	(optional starting in v4.7)
//     await client.connect();

    const db = client.db("tutor_booking_system");
    const tutorCollection = db.collection("tutor_booking_system_Collection");
    const bookedCollection = db.collection("books");

    app.get("/all-tutors", async (req, res) => {
      // console.log(req.query);

      const { search, sortBy } = req.query;
      // console.log({search,sortBy},"ssssss");

      let query = {};

      if (search) {
        query = {
          $or: [
            {
              subjectName: {
                $regex: search,
                $options: "i",
              },
            },
            {
              tutorName: {
                $regex: search,
                $options: "i",
              },
            },
            {
              institution: {
                $regex: search,
                $options: "i",
              },
            },
            {
              location: {
                $regex: search,
                $options: "i",
              },
            },
          ],
        };
      }

      let sortOption = {};
      if(sortBy === "price_low"){
        sortOption = {hourlyFee: 1};
      } else if(sortBy === "price_high"){
        sortOption = {hourlyFee: -1};
      }
      // else {
      //   cursor = await tutorCollection.find();
      // }

      const cursor = tutorCollection.find(query).sort(sortOption);
      const result = await cursor.toArray();
      // console.log(result);
      res.send(result);
    });

    app.get("/popular-tutors", async (req, res) => {
      const cursor = tutorCollection.find().limit(6);
      const result = await cursor.toArray();
      // console.log(result);
      res.send(result);
    });

    app.get("/all-tutors/:tutorId", verifyToken, async (req, res) => {
      // console.log(req.user);
      const { tutorId } = req.params;
      // console.log(tutorId);
      const query = { _id: new ObjectId(tutorId) };
      const result = await tutorCollection.findOne(query);
      res.send(result);
    });

    // Add a new tutor (Add Tutor page)
    app.post("/tutors", async (req, res) => {
      const tutorData = req.body;
      // console.log(tutorData);

      const result = await tutorCollection.insertOne({
        ...tutorData,
        totalSlot: Number(tutorData.totalSlot),
        hourlyFee: Number(tutorData.hourlyFee),
        createdAt: new Date(),
      });
      res.send(result);
    });

    //my-tutors getting n
    app.get("/my-tutors/:email", verifyToken, async (req, res) => {
      const { email } = req.params;

      if (req.user.email !== email) {
        return res.status(403).json({ message: "Forbidden access" });
      }

      const result = await tutorCollection
        .find({ tutorEmail: email })
        .toArray();

      res.send(result);
    });

    //my-tutor updated n
    app.patch("/tutors/:id", verifyToken, async (req, res) => {
      const { id } = req.params;
      const updatedData = req.body;

      const tutor = await tutorCollection.findOne({ _id: new ObjectId(id) });

      if (!tutor) {
        return res.status(404).json({ message: "Tutor not found" });
      }

      if (tutor.tutorEmail !== req.user.email) {
        return res.status(403).json({ message: "Forbidden access" });
      }

      const result = await tutorCollection.updateOne(
        { _id: new ObjectId(id) },
        {
          $set: {
            ...updatedData,
            totalSlot: Number(updatedData.totalSlot),
            hourlyFee: Number(updatedData.hourlyFee),
          },
        },
      );

      res.send(result);
    });

    //my-tutor delete n
    app.delete("/tutors/:id", verifyToken, async (req, res) => {
      const { id } = req.params;

      const tutor = await tutorCollection.findOne({ _id: new ObjectId(id) });

      if (!tutor) {
        return res.status(404).json({ message: "Tutor not found" });
      }

      if (tutor.tutorEmail !== req.user.email) {
        return res.status(403).json({ message: "Forbidden access" });
      }

      const result = await tutorCollection.deleteOne({ _id: new ObjectId(id) });

      res.send(result);
    });

    //get booked
    app.get("/booked/:studentId", verifyToken, async (req, res) => {
      const { studentId } = req.params;
      const result = await bookedCollection
        .find({ studentId: studentId })
        .toArray();
      // console.log(result);
      res.send(result);
    });

    app.patch("/booked/:tutorId", verifyToken, async (req, res) => {
      const { tutorId } = req.params;
      const bookedData = req.body;

      const tutor = await tutorCollection.findOne({
        _id: new ObjectId(tutorId),
      });

      if (!tutor) {
        res.status(404).json({ message: "Course not Found!" });
        return;
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const sessionDate = tutor.sessionStartDate
        ? new Date(tutor.sessionStartDate)
        : null;

      if (sessionDate) sessionDate.setHours(0, 0, 0, 0);

      if (sessionDate && today > sessionDate) {
        return res.status(400).json({
          message: "Booking is not available yet for this tutor",
        });
      }

      if (tutor.totalSlot <= 0) {
        return res.status(400).json({
          message:
            "This session is fully booked. You can not join at the moment.",
        });
      }

      await tutorCollection.updateOne(
        { _id: new ObjectId(tutorId) },
        {
          $inc: { totalSlot: -1 },
          $set: {
            lastBookedAt: new Date(),
          },
        },
      );

      const result = await bookedCollection.insertOne({
        ...bookedData,
        bookedAt: new Date(),
      });

      res.send(result);
    });

    app.delete("/booked/:tutorId", verifyToken, async (req, res) => {
      const { tutorId } = req.params;
      const studentId = req.user.id;

      const tutorObjectId = new ObjectId(tutorId);

      const existingBooked = await bookedCollection.findOne({
        tutorId,
        studentId,
      });

      if (!existingBooked) {
        return res.status(404).json({ message: "Booked tutor is not found!" });
      }

      await bookedCollection.deleteOne({
        tutorId,
        studentId,
      });

      const result = await tutorCollection.updateOne(
        { _id: tutorObjectId },
        {
          $inc: {
            // enrollCount: existingBooked ? -1 : 0,
            totalSlot: 1,
          },
        },
      );

      res.status(200).json({ success: true, result });

      // res.send(result);
    });

    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!",
    );
//   } finally {
//     // Connection stays open to keep serving requests — do not close here.
//   }
// }
// run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
