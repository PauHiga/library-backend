const { ApolloServer } = require('@apollo/server')
const { expressMiddleware } = require('@apollo/server/express4')
const { ApolloServerPluginDrainHttpServer } = require('@apollo/server/plugin/drainHttpServer')  
const { makeExecutableSchema } = require('@graphql-tools/schema')
const express = require('express')
const cors = require('cors')
const http = require('http')
const { WebSocketServer } = require('ws')
const { useServer } = require('graphql-ws/lib/use/ws')

const typeDefs = require('./schema')
const resolvers = require('./resolvers')
const jwt = require('jsonwebtoken')
const mongoose = require('mongoose')
const User = require('./models/user')

require('dotenv').config()

mongoose.set('strictQuery', false)

const MONGODB_URI = process.env.MONGODB_URI

console.log('connecting to', MONGODB_URI)

mongoose.connect(MONGODB_URI)
  .then(() => {
    console.log('connected to MongoDB')
  })
  .catch((error) => {
    console.log('error connection to MongoDB:', error.message)
  })

// mongoose.set('debug', true);

const start = async () => { 
    
  // Required logic for integrating with Express
  const app = express() 

  // Our httpServer handles incoming requests to our Express app.
  // Below, we tell Apollo Server to "drain" this httpServer,
  // enabling our servers to shut down gracefully.
  const httpServer = http.createServer(app)

  // Create our WebSocket server using the HTTP server we just set up. Through this we will handle the the WebSocket connections.
  const wsServer = new WebSocketServer({                 
    server: httpServer,
    path: '/',
  })

  const schema = makeExecutableSchema({ typeDefs, resolvers }) 
  const serverCleanup = useServer({ schema }, wsServer)     

  // ApolloServer initialization, with the drain plugin ApolloServerPluginDrainHttpServer
  // for our httpServer.
  const server = new ApolloServer({                                   
    schema: schema,
    plugins: [ApolloServerPluginDrainHttpServer({ httpServer }),
      {                                                 
        async serverWillStart() {
          return {
            async drainServer() {
              await serverCleanup.dispose();
            },
          };
        },
      },
    ], 
  })

  // AWAITS until "server" (Apollo's graphQL server) starts, so we can use it in the expressMiddleware
  await server.start()                     

  // Set up our Express middleware to handle CORS, body parsing,
  // and our expressMiddleware function.
  app.use(                    
    '/',
    // we need this middleware in Express to enable Cross-Origin Resource Sharing support.
    cors(),                             
    // we need this middleware in Express to parse incoming json data.
    express.json(),

    // expressMiddleware accepts two arguments:
    // an Apollo Server instance and optional configuration options. In this case, we configure it to accept the authentication logic.
    expressMiddleware(server, {             
      context: async ({ req }) => {
        const auth = req ? req.headers.authorization : null
        if (auth && auth.startsWith('Bearer ')) {
          const decodedToken = jwt.verify(auth.substring(7), process.env.JWT_SECRET)
          const currentUser = await User.findById(decodedToken.id)
          return { currentUser }
        }
      },
    }),
  )

  const PORT = 4000

  httpServer.listen(PORT, () =>
    console.log(`Server is now running on http://localhost:${PORT}`)
  )
}

//calls the start() function to start the server(s).
start()
