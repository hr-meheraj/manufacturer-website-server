const express = require('express');
require('dotenv').config();
const app = express();
const cors = require('cors');
const port = process.env.PORT || 5800;
const { MongoClient, ObjectId, ServerApiVersion } = require('mongodb');
const jwt = require('jsonwebtoken');
const uri = "mongodb+srv://hrmeheraj:hrmeheraj2007@cluster0.cv5my.mongodb.net/?retryWrites=true&w=majority";
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });
const stripe = require('stripe')(process.env.Seceret_Key);
const corsOptions = {
  origin: 'https://tools-manufacture.web.app',
  optionsSuccessStatus: 200 
}
app.use(cors(corsOptions));
app.use(express.json());

const secret = process.env.Secret_Token;

// Important Middleware
const verifyJWT = (req,res,next) => {
	const authorization = req.headers.authorization;
	if(!authorization){
		return res.status(401).send({message : "unauthorized"})
	}
	const token = authorization.split(' ')[1];
	
	jwt.verify(token, secret, (err, decoded) => {
  	if(err){
			res.status(403).send({message : "forbidden"});
		}
		req.decoded = decoded;
		next();
  });
}
// DB - MongoDB 
async function run() {
  try {
    await client.connect();
    const database = client.db("manufacture");
    const userCollection = database.collection("users");
    const blogCollection = database.collection("blogs");
		const productCollection = database.collection("products");
		const reviewCollection = database.collection("reviews");
		const purchaseCollection = database.collection("purchase");

		// Payment with stripe => 
// 		app.post("/create-payment-intent", async (req, res) => {
//       const amount = parseInt(req.body.price) * 100;
//       const paymentIntent = await stripe.paymentIntents.create({
//         amount : amount,
//         currency: 'usd',
//         payment_method_types:['card']
//       });
//       res.send({clientSecret: paymentIntent.client_secret})
// });
		
			// verifyAdmin 
		const verifyAdmin = async(req,res,next) => {
			const email = req.decoded.email;
			const getUser = await userCollection.findOne({email : email});
			if(getUser?.role === 'admin'){
				next();
			}else{
					res.status(403).send({message : 'forbidden'})
			}
		}
		// Update or Create new User => 
		app.put('/users/:email', async (req,res) => {
				const email = req.params.email;
				const user = req.body;
				const filter = { email : email };
				const token = jwt.sign(filter, secret, { expiresIn: '1d' });
				const option = {
					upsert : true
				}
				const updatedDocs = {
					$set : req.body
				}
			const result = await userCollection.updateOne(filter,updatedDocs, option);
			res.send({token : token , result}); 
		})
		// Get user or userInfo => 
		app.get('/users/:email', async(req,res) =>{
			const email = req.params.email;
			const filter = { email : email};
			const result = await userCollection.findOne(filter);
				
			res.send(result);
			
		});
		
		// Get All users 
		app.get('/users',verifyJWT, verifyAdmin ,async (req,res) => {
			const result = await userCollection.find().toArray();
			res.send(result);
		})
	
		// Get All users by Admin Middleware 
		app.get('/users',verifyJWT, async ( req,res) => {
			const result = await userCollection.find().toArray();
			res.send(result);
		})

		// Admin Checker 
		app.get('/users/admin/:email',async (req,res) => {
			const query = { email : req.params.email}
			const Admin = await userCollection.findOne(query);
			const isAdmin = Admin?.role === 'admin';
			res.send({ admin : isAdmin });
		});
		
		// Make Admin 
		app.put('/users/admin/:email',verifyJWT, verifyAdmin, async (req,res) => {
			const find = { email : req.params.email };
			const updatedRole = {
				$set : { role : 'admin'}
			}
			const option = { upsert : true};
			const result = await userCollection.updateOne(find, updatedRole, option);
			res.send(result)
		});

		// Delete a User as an Admin
		app.delete('/users/:email',verifyJWT, verifyAdmin, async(req,res) => {
			const email = req.params.email;
			const query = { email : email};
			const result = await userCollection.deleteOne(query);
			res.send(result);
		})

		// Adding Product => 
		app.post('/products', verifyJWT, verifyAdmin, async(req,res) => {
			const products = req.body;
			const result = await productCollection.insertOne(products);
			res.send(result);
			
		})

		// Total Product Count Api
		app.get('/productsCount', async(req,res) => {
			const count = await productCollection.estimatedDocumentCount();
			res.send({ count })
		})
		// Get All products => 
		app.get('/products', async ( req,res) => {
			const query = {};
			const page = parseInt(req.query.page);
			const size = parseInt(req.query.size);
			
			const result = await productCollection.find(query).sort({'_id':-1}).skip(size * page).limit(size).toArray();
			res.send(result);
		})


		// Get A product by Id => 
		app.get('/products/:id',async (req,res) => {
			const id = req.params.id;
			const query = { _id : ObjectId(id)};
			const result = await productCollection.findOne(query);
			res.send(result);
		});
		
		// Delete a product => 
		app.delete('/products/:id', verifyJWT, verifyAdmin, async(req,res) => {
			const filter = { _id : ObjectId(req.params.id)};
			const result = await productCollection.deleteOne(filter);
			res.send(result);
		});

		// Update a product => 
		app.put('/products/:id', verifyJWT, verifyAdmin,async(req,res) => {
			const filter = {_id : ObjectId(req.params.id)};
			const option = { upsert : true};
			const updatedDoc = {
				$set : req.body
			}
			const result = await productCollection.updateOne(filter,updatedDoc,option);
			res.send(result);
		})

		// products/quantity
		app.put('/products/quantity/:id',verifyJWT, async(req,res) => {
			const query = { _id : ObjectId(req.params.id)};
			const quantity = parseInt(req.body.quantity);
			const findProduct = await productCollection.findOne(query);
			const prevQuantity = parseInt(findProduct.quantity);
			const newQuantity = quantity + prevQuantity;
			const option = { upsert : true };
			const updatedDoc = {
				$set : { quantity : newQuantity}
			};
			const productQuantityUpdated = await productCollection.updateOne(query,updatedDoc, option);
			res.send(productQuantityUpdated);
		})
		// Update a product => 
			// Perchase Collection Starting => 
		app.post('/perchase',verifyJWT, async(req,res) => {
			
				const query = { _id : ObjectId(req.body.productId)};
				const product = await productCollection.findOne(query);
				const newQuantity = parseInt(product.quantity) - parseInt(req.body.quantity); 
		    const option = { upsert: true };
        const updatedDoc = {
          $set: {  quantity : newQuantity   }
        };
        const productUpdated =  await productCollection.updateOne(query, updatedDoc, option);
	 	    const insertPurchase = await purchaseCollection.insertOne(req.body);
		    const result = { productUpdated, insertPurchase };
		    res.send(result);
		
	});
		// Get Purchase Products By Email : 
		app.get("/purchase/:email",verifyJWT, async(req,res) => {
			const paramsEmail  = req.params.email;
			const decodedEmail = req.decoded.email;
				const query = { email : paramsEmail};
				const result = await purchaseCollection.find(query).toArray();
				res.send(result);
			
		});
		app.get("/purchase",verifyJWT, async(req,res) => {
				const query = {};
				const result = await purchaseCollection.find(query).toArray();
				res.send(result);
			
		});
		// Delete purchase by Admin  => 
		app.delete("/purchase/:id",verifyJWT,  async(req,res) => {
			const query = { _id : ObjectId(req.params.id)};
			const result = await purchaseCollection.deleteOne(query);
			res.send(result);
		})
		// Update Purchase info for payment => 
		app.put('/purchase/:id', verifyJWT, async(req,res) => {
			const query = { _id : ObjectId(req.params.id)};
			const option = { upsert : true};
			const updatedDoc = {
				$set : req.body
			}
			const result = await purchaseCollection.updateOne(query,updatedDoc,option);
			res.send(result);
		});

	app.get('/purchase/payment/:id', verifyJWT, async (req,res) => {
		const query = { _id : ObjectId(req.params.id)};
		const result = await purchaseCollection.findOne(query);
		res.send(result);
	})
	app.delete('/purchase/:id', verifyJWT, async(req,res) => {
		const query = { _id : ObjectId(req.params.id)};
		const result = await purchaseCollection.deleteOne(query);
		res.send(result);
	})
		// Review => 
		// Review Count => 
		app.get('/reviewsCount', async( req,res) => {
			const count = await reviewCollection.estimatedDocumentCount();
			res.send( { count })
		})
		// Get All Reviews => 
		app.get('/reviews', async(req,res) => {
			const query = {}; 
			const page = parseInt(req.query.page);
			const size = parseInt(req.query.size);
			const result = await reviewCollection.find(query).sort({'_id':-1}).skip(size * 
      page).limit(size).toArray();
			res.send(result);
		});

		// get a review => 
		app.get('/reviews/:email', async(req,res) => {
			const email = req.params.email;
			const query = { email : email};
			const result = await reviewCollection.findOne(query);
			res.send(result); 
		})
		// Add a Review 
		app.post('/reviews', async(req,res) => {
			const body = req.body;
			const query = { email : body.email};
			const exists = await reviewCollection.findOne(query);
			if(!exists){
			const result = await reviewCollection.insertOne(req.body);
			res.send(result);	
			}else{
				res.send({message: "Already Exists review"});
			}
	
		});

		app.put('/reviews/:email', async(req,res) => {
			const email = req.params.email;
			const query = {email : email};
			const updatedDoc = {
				$set : req.body
			}
			const option = {upsert : true};
			const result = await reviewCollection.updateOne(query,updatedDoc, option);
		})
		// Buy Products tools - purchase 
		// app.post('/products/purchase', async ( res,res) => {
		// 	const body = { }
		// })
		// Adding All blogs => 
		/**
		*  { title, description, imgUrl, authorName, authorEmail }
    */
		app.post('/blogs', async (req,res) => {
			const blogs = req.body;
			const result = await blogCollection.insertOne(blogs);
			res.send(result);
		})

		// get All blogs => 
		app.get('/blogs', async (req,res) => {
			const result = await blogCollection.find().toArray();
			res.send(result);
		})

		// Get one blog by id => 
		app.get('/blogs/:id', async(req,res) => {
			const id = req.params.id;
			const filter = { _id : ObjectId(id)};
			const result = await blogCollection.findOne(filter);
			res.send(result); 
		})

		// Delete a blog by id => 
		app.delete('/blogs/:id', async (req,res) => {
			const id = req.params.id;
			const filter = { _id : ObjectId(id)};
			const result = await blogCollection.deleteOne(filter);
			res.send(result);
		})
		//------------------------------------------//
		
  } finally {
  
  }
}
run().catch(console.dir);

run().catch(console.dir);
app.get('/', (req,res) =>{
	res.send("Hello from /");
})
app.listen(port, () => {
	console.log(`Server listening on the port = ${port}`);
})
