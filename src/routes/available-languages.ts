/**
 * @fileoverview Available languages route
 * @description Returns the list of supported target languages from the static config file.
 */

import { Hono } from "hono";
import { successResponse } from "@sudobility/whisperly_types";
import languagesConfig from "../config/languages.json";

const availableLanguagesRouter = new Hono();

// GET available languages
// Returns list of available target languages from config
availableLanguagesRouter.get("/", async (c) => {
  return c.json(successResponse(languagesConfig));
});

export default availableLanguagesRouter;
