const { GraphQLError } = require('graphql')
const jwt = require('jsonwebtoken')
const Book = require('./models/book')
const Author = require('./models/author')
const User = require('./models/user')
const { PubSub } = require('graphql-subscriptions')
const pubsub = new PubSub()


const resolvers = {
  Query: {
    allBooksCount: async () => Book.collection.countDocuments(),
    authorCount: async () => Author.collection.countDocuments(),
    allBooks: async (root, args) => {
      if(!args.genre){
        return Book.find({}).populate('author')
      }
      if(args.genre === 'all'){
        return Book.find({}).populate('author')
      }
      return Book.find({genres:args.genre}).populate('author')
    },

    allAuthors:async (root, args) => {
      return Author.find({}).populate('bookCount')
    },

    me: async (root, args, context) => {
      return context.currentUser
    }
  }, 

  Mutation:{
    addBook: async (root, args, context) =>{
      if(!context.currentUser){
        throw new GraphQLError('User not authorized', {
          extensions: {
            code: 'INVALID_TOKEN',
            invalidArgs: args.name
          }
        })
      }

      let author = await Author.findOne({name:args.author})
      if (!author) {
        const newAuthor = new Author({name: args.author})
        try{
          author = await newAuthor.save()
        } catch (error) {
          throw new GraphQLError('Saving author failed', {
            extensions: {
              code: 'INVALID_AUTHOR_NAME',
              invalidArgs: args.author,
              error
            }
          })
        }
      }

      const newBook = {...args, author:author._id.toString()}
      const book = new Book(newBook)

      try{
        await book.save()
        await Author.findByIdAndUpdate(author._id.toString(), {bookCount:book._id.toString()}, {new : true})
        
      } catch (error) {
        throw new GraphQLError('Saving book failed', {
          extensions: {
            code: 'BAD_USER_INPUT',
            invalidArgs: args.name,
            error
          }
        })
      }
      
      // Adding a new book publishes a notification about the operation to all subscribers with PubSub's method publish:
      pubsub.publish('BOOK_ADDED', { bookAdded: book.populate('author') })  

      return book.populate('author')

    },
    editAuthor: async (root, args, context) => {
      if(!context.currentUser){
          throw new GraphQLError('User not authorized', {
          extensions: {
            code: 'INVALID_TOKEN',
            invalidArgs: args.name,
          }
        })
      }
      let author = await Author.findOne({name:args.name})
      if (!author) {
        return null
      }
      const updatedAuthor = await Author.findByIdAndUpdate(author._id.toString(), {born:args.setBornTo}, {new : true})
      
      return updatedAuthor
    },
    createUser: async(root, args) =>{
      const user = new User({ ...args })
      return user.save()
        .catch(error => {
          throw new GraphQLError('Creating the user failed', {
            extensions: {
              code: 'BAD_USER_INPUT',
              invalidArgs: args.name,
              error
            }
          })
        })
    },
    login: async (root, args) => {
      const user = await User.findOne({ username: args.username })

      if ( !user || args.password !== 'secret' ) {
        throw new GraphQLError('wrong credentials', {
          extensions: {
            code: 'BAD_USER_INPUT'
          }
        })        
      }

      const userForToken = {
        username: user.username,
        id: user._id,
      }

      return { value: jwt.sign(userForToken, process.env.JWT_SECRET) }
    }
  },

  Subscription: {
    bookAdded: {
      subscribe: () => pubsub.asyncIterator('BOOK_ADDED')
    },
  },

}

module.exports = resolvers