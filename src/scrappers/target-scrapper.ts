import fetch from "node-fetch";
import * as jsdom from "jsdom";
import * as stringSimilarity from "string-similarity";
import { RecentProduct } from "../model/SealedProduct.js";
import { logger, normalizeProductName } from "../common.js";
import { getSealedProducts } from "../database.js";
import clc from 'cli-color'

const SEARCH_BASE = ""