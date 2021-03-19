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

const MONGODB_URI = 'mongodb://localhost:27017/books'

mongoose.connect(MONGODB_URI, { userNewUrlParser: true , useUnifiedTopology: true, useFindAndModify: false, useCreateIndex: true})
.then(() => {
    console.log('connected to MongoDB')
}).catch((error) => {
    console.log('An error occurred while connecting to MongoDB', error.message)
});



// let authors = [{
//         name: 'Robert Martin',
//         id: "afa51ab0-344d-11e9-a414-719c6709cf3e",
//         born: 1952,
//     },
//     {
//         name: 'Martin Fowler',
//         id: "afa5b6f0-344d-11e9-a414-719c6709cf3e",
//         born: 1963
//     },
//     {
//         name: 'Fyodor Dostoevsky',
//         id: "afa5b6f1-344d-11e9-a414-719c6709cf3e",
//         born: 1821
//     },
//     {
//         name: 'Joshua Kerievsky', // birthyear not known
//         id: "afa5b6f2-344d-11e9-a414-719c6709cf3e",
//     },
//     {
//         name: 'Sandi Metz', // birthyear not known
//         id: "afa5b6f3-344d-11e9-a414-719c6709cf3e",
//     },
// ]

// let books = [{
//         title: 'Clean Code',
//         published: 2008,
//         author: 'Robert Martin',
//         id: "afa5b6f4-344d-11e9-a414-719c6709cf3e",
//         genres: ['refactoring']
//     },
//     {
//         title: 'Agile software development',
//         published: 2002,
//         author: 'Robert Martin',
//         id: "afa5b6f5-344d-11e9-a414-719c6709cf3e",
//         genres: ['agile', 'patterns', 'design']
//     },
//     {
//         title: 'Refactoring, edition 2',
//         published: 2018,
//         author: 'Martin Fowler',
//         id: "afa5de00-344d-11e9-a414-719c6709cf3e",
//         genres: ['refactoring']
//     },
//     {
//         title: 'Refactoring to patterns',
//         published: 2008,
//         author: 'Joshua Kerievsky',
//         id: "afa5de01-344d-11e9-a414-719c6709cf3e",
//         genres: ['refactoring', 'patterns']
//     },
//     {
//         title: 'Practical Object-Oriented Design, An Agile Primer Using Ruby',
//         published: 2012,
//         author: 'Sandi Metz',
//         id: "afa5de02-344d-11e9-a414-719c6709cf3e",
//         genres: ['refactoring', 'design']
//     },
//     {
//         title: 'Crime and punishment',
//         published: 1866,
//         author: 'Fyodor Dostoevsky',
//         id: "afa5de03-344d-11e9-a414-719c6709cf3e",
//         genres: ['classic', 'crime']
//     },
//     {
//         title: 'The Demon ',
//         published: 1872,
//         author: 'Fyodor Dostoevsky',
//         id: "afa5de04-344d-11e9-a414-719c6709cf3e",
//         genres: ['classic', 'revolution']
//     },
// ]

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
`

const resolvers = {
    Query: {
        bookCount: () => Book.collection.countDocuments(),
        authorCount: () => Author.collection.countDocuments(),
        allBooks: (root, args) => {
            return Book.find({}).populate('author', 'name born')
        

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
        

            const book = new Book({
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



             return await book.populate('author', 'name').execPopulate()
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
    url
}) => {
    console.log(`Server ready at ${url}`)
})