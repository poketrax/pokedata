import clc from 'cli-color'
import * as fs from 'fs'
import fetch from 'node-fetch'

export async function downloadFile(url, path) {
    const res = await fetch(url);
    const fileStream = fs.createWriteStream(path);
    await new Promise((resolve, reject) => {
        if (res.body != null) {
            res.body.pipe(fileStream);
            res.body.on("error", reject);
            fileStream.on("finish", resolve);
        } else {
            reject()
        }
    });
};

export async function consoleHeader(msg) {
    console.log(clc.blueBright.bold("----------------------------------------------"))
    console.log(clc.blueBright.bold(msg))
    console.log(clc.blueBright.bold("----------------------------------------------"))
}

// Javascript program to calculate the standard deviation of an array
export function dev(arr) {
    // Creating the mean with Array.reduce
    let mean = arr.reduce((acc, curr) => {
        return acc + curr
    }, 0) / arr.length;

    // Assigning (value - mean) ^ 2 to every array item
    arr = arr.map((k) => {
        return (k - mean) ** 2
    })

    // Calculating the sum of updated array
    let sum = arr.reduce((acc, curr) => acc + curr, 0);

    // Returning the standard deviation
    return Math.sqrt(sum / arr.length)
}