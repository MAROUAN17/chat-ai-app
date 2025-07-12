import express, { Request, Response } from "express"
import cors from "cors"
import dotenv from "dotenv"
import { StreamChat } from "stream-chat";
import OpenAI from "openai";
import { db } from "./config/database.js"
import { chats, users } from "./db/schema.js"
import { eq } from "drizzle-orm"
import { ChatCompletionMessageParam } from "openai/resources/index";


//define type myChannelData
type MyChannelData = {
  name?: string;
  created_by_id?: string;
};

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

//initialize stream chat
const chatClient = StreamChat.getInstance(
    process.env.STREAM_API_KEY!,
    process.env.STREAM_PRIVATE_KEY!
);

//initialize openai
const openAi = new OpenAI({
    apiKey: process.env.OPEN_AI_KEY
});

//route
app.post(
    '/registerUser', 
    async(req: Request, res: Response): Promise<any> => {
        const { name, email } = req.body;

        if (!name || !email) {
            return res.status(400).json({ error: "Name and email are required!" });
        }

        try {
            const userId = email.replace(/[^a-zA-Z0-9_-]/g, '_');

            //check if user exists
            const userResponse = await chatClient.queryUsers({ id: {$eq: userId }});
            if (!userResponse.users.length) {
                await chatClient.upsertUser({
                    id: userId,
                    name: name,
                    email: email,
                    role: 'user',
                } as any)
            }
            
            //check for existing user in the database
            const existingUser = await db.select().from(users).where(eq(users.userId, userId));
            
            if (!existingUser.length) {
                console.log(`user ${userId} does not exist in the database. Adding...`);
                await db.insert(users).values({ userId, name, email });
            }

            res.status(200).json({ userId, name, email });
        } catch(error) {
            res.status(500).json({ error: "Internal Server Error" });
        }
})

//chat endpoint
app.post(
    '/chat', 
    async (req: Request, res: Response): Promise<any> => {
        const { message, userId } = req.body;

        if (!message || !userId)
            return res.status(400).json({ error: "Message and user id are required!" });
        
        try {
            //verify user exists
            const userResponse = await chatClient.queryUsers({id: userId});

            if (!userResponse.users.length) {
                return res.status(404).json({error: "User is not found. Please register first!"});
            }
            
            //check user in the db
            const existingUser = await db.select().from(users).where(eq(users.userId, userId));
            
            if (!existingUser.length) {
                return res.status(404).json({ error: "User not found. Please register first." });
            }

            //send message to openai
            const response = await openAi.chat.completions.create({
                model: 'gpt-4',
                messages: [{ role: 'user', content: message }],
            });

            const aiMessage: string = response.choices[0].message?.content ?? "No response from AI";
            
            //save ai response in the db
            await db.insert(chats).values({ userId, message, reply: aiMessage });

            //create channel
            const channel = chatClient.channel("messaging", `chat-${userId}`, <MyChannelData>{
                name: "Ai Chat",
                created_by_id: 'ai_bot',
            });
            
            await channel.create();
            await channel.sendMessage({ text: aiMessage, user_id: 'ai_bot' });

            res.status(200).json({ reply: aiMessage });
        } catch (error) {

        }
})

//get messages of a specific user
app.post('/getMessage', 
    async (req:Request, res:Response): Promise<any> => {
        const { userId } = req.body;

        if (!userId) {
            return res.status(400).json({ error: "USER ID is required" });
        }

        try {
            const chatHistory = await db.select().from(chats).where(eq(chats.userId, userId));

            res.status(200).json({ messages: chatHistory });
        } catch(error) {
            console.log("Error fetching chat history!");
            res.status(500).json({ error: "Internat Server Error" });
        }
})

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {console.log(`Server running on ${PORT}`)});
