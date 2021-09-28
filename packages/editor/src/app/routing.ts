import { tryParseIdentifier } from "../identifiers";

export default function routing() {
  const paths = window.location.pathname.split("/").filter((p) => p.length);

  let part1: string | undefined;
  let part2: string | undefined;

  for (let path of paths) {
    if (!part1) {
      part1 = path.toLowerCase();
      continue;
    }
    if (!part2) {
      part2 = path.toLowerCase();
      continue;
    }
  }

  const parsedIdentifier = tryParseIdentifier(paths.join("/"));
  if (parsedIdentifier !== "invalid-identifier") {
    return {
      page: "document" as "document",
      identifier: parsedIdentifier,
    };
  } else if (part1 && part1.startsWith("@") && !part2) {
    return { page: "owner" as "owner", owner: part1 }; // TODO: what if user pages should have subpages?
  } else if (part1 === "login") {
    return { page: "login" as "login" };
  } else if (part1 === "register") {
    return { page: "register" as "register" };
  } else if (part1 === "recover") {
    return { page: "recover" as "recover" };
  } else if (!part1) {
    return { page: "root" as "root" };
  } else {
    throw new Error("unknown page"); // TODO: not found
  }
}