const express = require('express');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const Groq = require('groq-sdk');
const cors = require('cors');
const bodyParser = require('body-parser');
const axios = require('axios');
// const genAI = new GoogleGenerativeAI('AIzaSyAScfpLC--aaxBROlyovtqAtO1lYs_qb-M');
const groq = new Groq({ apiKey: "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" });
// const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { GoogleAIFileManager } = require("@google/generative-ai/server");

const apiKey = 'AIzaSyAScfpLC--aaxBROlyovtqAtO1lYs_qb-M';
const genAI = new GoogleGenerativeAI(apiKey);
const fileManager = new GoogleAIFileManager(apiKey);


const app = express();
const PORT = process.env.PORT || 3000;
app.use(cors());
app.use(bodyParser.json({ limit: "10mb", extended: true }));
app.use(bodyParser.urlencoded({ extended: true }));
app.disable('x-powered-by')

// Set up multer to handle file uploads
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Upload and process PDF route
app.post('/groq', upload.single('file'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
    }

    try {
        // Extract text from the uploaded PDF
        const pdfText = await pdfParse(req.file.buffer);

        // Send the extracted text to Groq for summarization
        const summary = await groq.chat.completions.create({
            messages: [
                {
                    role: "user",
                    content: `Summarize this lab report: ${pdfText.text}`,
                },
            ],
            model: "mixtral-8x7b-32768",
        });

        const summaryText = summary.choices[0]?.message?.content || "No summary available";

        res.json({ summary: summaryText });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Error processing the PDF" });
    }
});

app.post('/fireworks', upload.single('file'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
    }

    try {
        // Extract text from the uploaded PDF
        const pdfText = await pdfParse(req.file.buffer);

        // Send the extracted text to Groq for summarization
        /* const summary = await groq.chat.completions.create({
            messages: [
                {
                    role: "user",
                    content: `Summarize this lab report: ${pdfText.text}`,
                },
            ],
            model: "mixtral-8x7b-32768",
        }); */

        const summaryText = await fetch("https://api.fireworks.ai/inference/v1/chat/completions", {
            method: "POST",
            headers: {
                "Accept": "application/json",
                "Content-Type": "application/json",
                "Authorization": "Bearer fw_3ZKvYwCPhzJDGUuC3ccjzn5D"
            },
            body: JSON.stringify({
                model: "accounts/fireworks/models/llama-v3p2-11b-vision-instruct",
                max_tokens: 16384,
                top_p: 1,
                top_k: 40,
                presence_penalty: 0,
                frequency_penalty: 0,
                temperature: 0.2,
                messages: [{
                    role: "user",
                    content: `Summarize this lab report: ${pdfText.text}`,
                }
                ]
            })
        });

        res.json({ summary: summaryText });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Error processing the PDF" });
    }
});

app.post('/gemini', async (req, res) => {
    try {
        const reponse = await run();

        res.json({ data: 1, reponse });

    } catch (error) {
        console.error('Error processing the PDF:', error);
        res.status(500).json({ error: "Error processing the PDF" });
    }
});

async function uploadToGemini(path, mimeType) {
    const uploadResult = await fileManager.uploadFile(path, {
        mimeType,
        displayName: path,
    });
    const file = uploadResult.file;
    console.log(`Uploaded file ${file.displayName} as: ${file.name}`);
    return file;
}


async function waitForFilesActive(files) {
    console.log("Waiting for file processing...");
    for (const name of files.map((file) => file.name)) {
        let file = await fileManager.getFile(name);
        while (file.state === "PROCESSING") {
            process.stdout.write(".")
            await new Promise((resolve) => setTimeout(resolve, 10_000));
            file = await fileManager.getFile(name)
        }
        if (file.state !== "ACTIVE") {
            throw Error(`File ${file.name} failed to process`);
        }
    }
    console.log("...all files ready\n");
}

const model = genAI.getGenerativeModel({
    model: "gemini-1.5-flash",
    systemInstruction: `You are an expert lab technician with extensive medical knowledge.
            Your primary task is to analyze and extract relevant data from lab reports, including test results, 
            interpretation of values, and providing insights based on the medical context.`,
});

const generationConfig = {
    temperature: 0.5,
    topP: 0.95,
    topK: 64,
    maxOutputTokens: 100000,
    responseMimeType: "application/pdf",
};

function extractJsonFromString(text) {
    const regex = /```json\s*([\s\S]*?)\s*```/;
    const match = text.match(regex);
    if (match && match[1]) {
        try {
            return JSON.parse(match[1]);
        } catch (error) {
            console.error("Failed to parse JSON:", error);
        }
    }
    return null; // Return null if JSON couldn't be extracted
}

async function run() {
    // TODO Make these files available on the local file system
    // You may need to update the file paths
    const files = [
        await uploadToGemini("pdfs/smarthealth.pdf", "application/pdf"),
    ];

    // Some files have a processing delay. Wait for them to be ready.
    await waitForFilesActive(files);

    console.log("files", files)

    const result = await model.generateContent([
        {
            fileData: {
                mimeType: files[0].mimeType,
                fileUri: files[0].uri,
            },
        },
        {
            text: `Summarize the attached lab report, focusing on the health checkup analysis. 
            Extract all health parameters along with their exact values, maximum and minimum reference ranges, and units. 
            Present the information in the following JSON schema:
            
            RESULT={
                "patient_name": "Ms Priyanka J",
                "date_of_test": "26-07-2024",
                "age":34,
                "gender":"female",
                "parameters": {
                    "hba1c": {
                        "value": 5.8,
                        "unit": "%",
                        "range": {
                            "min": 4.2,
                            "max": 5.9
                        }
                    },
                    "vitamin_d": {
                        "value": 12,
                        "unit": "ng/ml",
                        "range": {
                            "min": 20,
                            "max": 50
                        }
                    }
                }
            }
            Return: Array<RESULT>
            
            Make sure to:
    
            1. Capture the exact values of all health parameters listed in the report.
            2. Include the minimum and maximum reference ranges for each parameter.
            3. Ensure the units for all measurements are clearly stated.
            4. Provide the patient’s name and test date at the top of the JSON.
    
            This information is critical for my health data analysis report, so be sure to include all records accurately.`,
        },
    ]);

    console.log("result.response", result.response, result.response.usageMetadata)

    return {
        "result": extractJsonFromString(result.response.candidates[0].content.parts[0].text),
        "metadata": result.response.usageMetadata
    };
}

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});