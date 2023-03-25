const express = require("express");
const path = require("path");

const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const app = express();
app.use(express.json());
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const dbPath = path.join(__dirname, "twitterClone.db");

let db = null;

const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server Running at http://localhost:3000/");
    });
  } catch (e) {
    console.log(`DB Error: ${e.message}`);
    process.exit(1);
  }
};

initializeDBAndServer();

app.post("/register/", async (request, response) => {
  const { username, name, password, gender } = request.body;
  const hashedPassword = await bcrypt.hash(request.body.password, 10);
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}'`;
  const dbUser = await db.get(selectUserQuery);
  if (dbUser === undefined) {
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const createUserQuery = `
      INSERT INTO 
        user (username, password, name, gender) 
      VALUES 
        (
          '${username}',
          '${hashedPassword}',  
          '${name}',
          '${gender}'
        )`;
      const dbResponse = await db.run(createUserQuery);
      const newUserId = dbResponse.lastID;
      response.send(`User created successfully`);
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

app.post("/login", async (request, response) => {
  const { username, password } = request.body;
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}'`;
  const dbUser = await db.get(selectUserQuery);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatched === true) {
      const payload = {
        username: username,
      };
      const jwtToken = jwt.sign(payload, "MY_SECRET_TOKEN");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

const authenticate = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "MY_SECRET_TOKEN", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};

//api 3

app.get("/user/tweets/feed/", authenticate, async (request, response) => {
  const username = request.username;
  const selectUserQuery = `
    select * from user where username = '${username}'
    `;
  const dbUser = await db.get(selectUserQuery);
  const { user_id } = dbUser;
  const getTweetQuery = `
    select user.username,tweet.tweet,tweet.date_time
    from
    (follower left join user on follower.following_user_id = user.user_id) as T
     left join tweet on tweet.user_id = T.user_id 
     where follower.follower_user_id = ${user_id} 
     order by tweet.date_time asc 
     limit 5;`;
  const dbResponse = await db.all(getTweetQuery);
  response.send(dbResponse);
});

//api 4
app.get("/user/following/", authenticate, async (request, response) => {
  const username = request.username;
  const selectUserQuery = `
    select * from user where username = '${username}'`;
  const dbUser = await db.get(selectUserQuery);
  const { user_id } = dbUser;
  const getFollowingUserNamesQuery = `
    select user.username from 
    follower left join user on follower.following_user_id = user.user_id
    where follower.follower_user_id = ${user_id}`;
  const dbResponse = await db.all(getFollowingUserNamesQuery);
  response.send(dbResponse);
});

//api 5

app.get("/user/followers/", authenticate, async (request, response) => {
  const username = request.username;
  const selectUserQuery = `
    select * from user where username = '${username}'`;
  const dbUser = await db.get(selectUserQuery);
  const { user_id } = dbUser;
  const getFollowingUserNamesQuery = `
    select user.username from 
    follower left join user on follower.follower_user_id = user.user_id
    where follower.following_user_id = ${user_id}`;
  const dbResponse = await db.all(getFollowingUserNamesQuery);
  response.send(dbResponse);
});

//api 6

app.get("/tweets/:tweetId/", authenticate, async (request, response) => {
  const username = request.username;
  const selectUserQuery = `
        select * from user where username = '${username}'`;
  const dbUser = await db.get(selectUserQuery);
  const { user_id } = dbUser;
  const { tweetId } = request.params;
  const isUserFollowingTheUserQuery = `
    select * from follower left join tweet on follower.following_user_id = tweet.user_id
    where follower.follower_user_id = ${user_id} and tweet.tweet_id = ${tweetId}
     `;
  let isUserFollowingTheUser = await db.get(isUserFollowingTheUserQuery);
  if (isUserFollowingTheUser === undefined) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    const likesCountQuery = `
        select count() as likes
        from like
        where tweet_id = ${tweetId}
        `;
    const { likes } = await db.get(likesCountQuery);
    const replyCountQuery = `
    select count() as replies from reply
    where tweet_id = ${tweetId}`;
    const { replies } = await db.get(replyCountQuery);
    const tweetQuery = `
    select tweet,date_time
    from tweet where tweet_id = ${tweetId}`;
    const dbResponse = await db.get(tweetQuery);
    let result = {};
    result.tweet = dbResponse.tweet;
    result.likes = likes;
    result.replies = replies;
    result.dateTime = dbResponse.date_time;
    response.send(result);
  }
});

//api 7
app.get("/tweets/:tweetId/likes/", authenticate, async (request, response) => {
  const { tweetId } = request.params;
  const username = request.username;
  const selectUserQuery = `
        select * from user where username = '${username}'`;
  const dbUser = await db.get(selectUserQuery);
  const { user_id } = dbUser;
  const tweetedUserIdQuery = `select user_id from tweet where tweet_id = ${tweetId}`;
  let tweetedUserId = await db.get(tweetedUserIdQuery);
  tweetedUserId = tweetedUserId.user_id;
  const isRequestedUserFollowingTheTweetedUserQuery = `
  select * from follower where follower_user_id = '${tweetedUserId}' and following_user_id = '${user_id}'`;
  const isRequestedUserFollowingTheTweetedUser = await db.get(
    isRequestedUserFollowingTheTweetedUserQuery
  );
  if (isRequestedUserFollowingTheTweetedUser === undefined) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    const fetchingUserAndLikesQuery = `
      select user.username from user left join like on user.user_id = like.user_id where tweet_id = ${tweetId}`;
    const likeResponse = await db.all(fetchingUserAndLikesQuery);
    let resultArray = [];
    likeResponse.forEach((obj) => {
      resultArray.push(obj.username);
    });
    const resultObj = {
      likes: resultArray,
    };
    response.send(resultObj);
  }
});

//api 8
app.get(
  "/tweets/:tweetId/replies/",
  authenticate,
  async (request, response) => {
    const { tweetId } = request.params;
    const username = request.username;
    const selectUserQuery = `
        select * from user where username = '${username}'`;
    const dbUser = await db.get(selectUserQuery);
    const { user_id } = dbUser;
    const tweetedUserIdQuery = `select user_id from tweet where tweet_id = ${tweetId}`;
    let tweetedUserId = await db.get(tweetedUserIdQuery);
    tweetedUserId = tweetedUserId.user_id;
    const isRequestedUserFollowingTheTweetedUserQuery = `
  select * from follower where follower_user_id = '${tweetedUserId}' and following_user_id = '${user_id}'`;
    const isRequestedUserFollowingTheTweetedUser = await db.get(
      isRequestedUserFollowingTheTweetedUserQuery
    );
    if (isRequestedUserFollowingTheTweetedUser === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const fetchingUserAndReplyQuery = `
      select user.username as username,reply.reply as reply from user left join reply on user.user_id = reply.user_id where tweet_id = ${tweetId}`;
      const replyResponse = await db.all(fetchingUserAndReplyQuery);
      let resultArray = [];
      replyResponse.forEach((obj) => {
        resultArray.push({ name: obj.username, reply: obj.reply });
      });
      const resultObj = {
        replies: resultArray,
      };
      response.send(resultObj);
    }
  }
);

//api 9

app.get("/user/tweets/", authenticate, async (request, response) => {
  const username = request.username;
  const selectUserQuery = `
        select * from user where username = '${username}'`;
  const dbUser = await db.get(selectUserQuery);
  const { user_id } = dbUser;
  const tweetsQuery = `
    select tweet,count(like_id) as total_likes,count(reply) as total_replies,date_time from user left join tweet on tweet.user_id = user.user_id left join like on like.tweet_id = tweet.tweet_id left join reply on tweet.tweet_id = reply.tweet_id  where user.user_id = ${user_id} group by tweet.tweet_id;`;
  const dbResponse = await db.all(tweetsQuery);
  response.send(dbResponse);
});

//api 10
app.post("/user/tweets/", authenticate, async (request, response) => {
  const username = request.username;
  const { tweet } = request.body;
  const selectUserQuery = `
        select * from user where username = '${username}'`;
  const dbUser = await db.get(selectUserQuery);
  const { user_id } = dbUser;
  const date = new Date();
  const presentDateTime = `${date.getFullYear()}-${
    date.getMonth() + 1
  }-${date.getDate()} ${date.getHours()}:${date.getMinutes()}:${date.getSeconds()}`;
  const createTweetQuery = `
  insert into tweet(tweet,user_id,date_time)
  values ('${tweet}',${user_id},'${presentDateTime}')`;
  await db.run(createTweetQuery);
  response.send("Created a Tweet");
});

//api 11
app.delete("/tweets/:tweetId/", authenticate, async (request, response) => {
  const { tweetId } = request.params;
  const username = request.username;
  const selectUserQuery = `
        select * from user where username = '${username}'`;
  const dbUser = await db.get(selectUserQuery);
  const { user_id } = dbUser;

  const tweetUserIdQuery = `select user_id from tweet where tweet_id = ${tweetId}`;
  let tweetUserId = await db.get(tweetUserIdQuery);
  tweetUserId = tweetUserId.user_id;
  if (user_id !== tweetUserId) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    await db.run(`delete from tweet where tweet_id = ${tweetId}`);
    response.send("Tweet Removed");
  }
});

module.exports = app;
