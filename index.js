const {
    ApolloServer,
    gql,
    UserInputError,
    AuthenticationError
} = require('apollo-server')


const mongoose = require('mongoose')

const jwt = require('jsonwebtoken')
const JWT_SECRET = 'jgoksdajlöfdjlkajfdlösjlfkdsjljlkfjsdäöjfd' 

const Author = require('./models/author')
const Book = require('./models/book')
const User = require('./models/user')

const { PubSub } = require('apollo-server')
const pubsub = new PubSub();

const MONGODB_URI = 'mongodb://localhost:27017/books'

mongoose.connect(MONGODB_URI, { userNewUrlParser: true , useUnifiedTopology: true, useFindAndModify: false, useCreateIndex: true})
.then(() => {
    console.log('connected to MongoDB')
}).catch((error) => {
    console.log('An error occurred while connecting to MongoDB', error.message)
});



const typeDefs = gql `
  type Query {
      bookCount: Int!
      authorCount: Int!
      allBooks(author: String, genre: String): [Book]
      allAuthors:[Author]
      me:User
  }

  type User {
      username: String!
          favoriteGenre: String!
          id: ID!
  }

  type Token {
      value: String!
  }


  type Book {
      title: String!
      published: Int!
      author: Author!
      id: ID!
      genres: [String]!
  }

 type Author {
     name: String!
     id: String!
     born: Int
     bookCount: Int
 } 

type Mutation {
    addBook(
        title: String!
        published: Int!
        author: String!
        genres: [String!]
    ): Book
    editAuthor(
        name: String!
        setBornTo: Int!
    ): Author

    createUser(
        username: String!
        favoriteGenre: String!
    ): User

    login(
        username: String!
        password: String!
    ): Token
}

type Subscription {
    bookAdded: Book!
}


`

const resolvers = {
    Query: {
        bookCount: () => Book.collection.countDocuments(),
        authorCount: () => Author.collection.countDocuments(),
        allBooks: async (root, args) => {
            // find by author AND / OR genre
            let author = {}
            if (args.author) {
                 author = await Author.findOne({name: args.author})
            }

            const query = {}
            author._id ? query.author = author._id : query
            args.genre ? query.genres = args.genre : query


            return await Book.find(query).populate('author', 'name born')
        

    },
        allAuthors: () => Author.find({}),
        
        me: (root, args, context) => {
             return context.currentUser
         },
    },

    Author: {
        bookCount: async (root) => {    
            const booksByAuthor = await Book.find({ author: root._id })
            return booksByAuthor.length
            
        }
    },
    Mutation: {
        addBook: async (root, args, context) => {
            if (!context.currentUser) {
                throw new AuthenticationError('User not authenticated')
            }
            let author = {}
            const foundAuthor = await Author.findOne({ name: args.author })

              if (!foundAuthor) {
                  let newAuthor = new Author({
                      name: args.author,
                      born: null
                  })
                  try {
                    author = await newAuthor.save()
                  } catch (error) {
                      console.log(error)
                  }
              } else {
                  author = foundAuthor
              }
        

            let book = new Book({
                title: args.title,
                published: args.published,
                genres: args.genres,
                author: author._id
            })
         
            try {
               await book.save()
               
            } catch (error) {
                throw new UserInputError(error.message, {
                    invalidArgs: args
                });
            }

            // Author must be populated to not cause GraphQL errors
            book = await book.populate('author', 'name').execPopulate()

            pubsub.publish('BOOK_ADDED', { bookAdded: book })


             return book
        },
        editAuthor: async (root, args, context) => {
            if (!context.currentUser) {
                throw new AuthenticationError('User not authenticated')
            }
            const updatedAuthor = await Author.findOneAndUpdate({
                name: args.name
            }, 
            {
            born: args.setBornTo
            },
            {
                new: true
            })
        return updatedAuthor
        },

    createUser: (root, { username, favoriteGenre }) => {
        const user = new User({ username, favoriteGenre })

        return user.save()
        .catch(error => {
            throw new UserInputError(error.message, {
                invalidArgs: args,
            })
        })
    },

    login: async (root, args) => {
        const user = await User.findOne({ username: args.username })

        if (!user || args.password !== 'secret') {
            throw new UserInputError('wrong credentials')

        }

        const userForToken = {
            username: user.username,
            id: user._id
        }

        return { value: jwt.sign(userForToken, JWT_SECRET)}
    }
    },
    Subscription: {
        bookAdded: {
            subscribe: () => pubsub.asyncIterator(['BOOK_ADDED'])
        }
    }
}

const server = new ApolloServer({
    typeDefs,
    resolvers,
    context: async ( { req }) =>  {
        const auth = req ? req.headers.authorization : null
        if (auth && auth.toLowerCase().startsWith('bearer ')) {
            const decodedToken = jwt.verify(auth.substring(7), JWT_SECRET)
            
            const currentUser = await User.findById(decodedToken.id)

            return { currentUser }

        }
    }
})

server.listen().then(({
    url, subscriptionsUrl
}) => {
    console.log(`Server ready at ${url}`)
    console.log(`Subscriptions ready at ${subscriptionsUrl}`)
})