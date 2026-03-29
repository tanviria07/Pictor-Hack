import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const SHARED_DIR = path.join(ROOT, "shared", "problems");
const BACKEND_DIR = path.join(ROOT, "backend-go", "internal", "problems", "data");
const RUNNER_DIR = path.join(ROOT, "runner-python", "problems");

const PATTERN_TO_CATEGORY = {
  "Arrays & Hashing": "arrays-hashing",
  "Two Pointers": "two-pointers",
  "Sliding Window": "sliding-window",
  Stack: "stack",
  "Binary Search": "binary-search",
  "Linked List": "linked-list",
  Trees: "trees",
  Tries: "tries",
  "Heap / Priority Queue": "heap-priority-queue",
  Backtracking: "backtracking",
  Graphs: "graphs",
  "Advanced Graphs": "advanced-graphs",
  "1-D Dynamic Programming": "dp-1d",
  "2-D Dynamic Programming": "dp-2d",
  Greedy: "greedy",
  Intervals: "intervals",
  "Math & Geometry": "math-geometry",
  "Bit Manipulation": "bit-manipulation",
};

const COMPARISON_BY_SLUG = {
  "top-k-frequent-elements": "unordered_list",
  "three-sum": "unordered_nested_list",
  "group-anagrams": "unordered_nested_list",
  subsets: "unordered_nested_list",
  "subsets-ii": "unordered_nested_list",
  permutations: "unordered_nested_list",
  "permutations-ii": "unordered_nested_list",
  "combination-sum": "unordered_nested_list",
  "combination-sum-ii": "unordered_nested_list",
  "palindrome-partitioning": "unordered_nested_list",
  "n-queens": "unordered_nested_list",
  "clone-graph": "graph_adj_list",
  "copy-list-with-random-pointer": "random_list",
  "encode-and-decode-strings": "codec_roundtrip_strings",
  "serialize-and-deserialize-binary-tree": "codec_roundtrip_tree",
};

const CLASS_OVERRIDES = {
  "encode-and-decode-strings": {
    className: "Codec",
    constructorParams: [],
    methods: [
      {
        name: "encode",
        params: [{ name: "strs", type: "List[str]" }],
        return_type: "str",
      },
      {
        name: "decode",
        params: [{ name: "s", type: "str" }],
        return_type: "List[str]",
      },
    ],
  },
  "serialize-and-deserialize-binary-tree": {
    className: "Codec",
    constructorParams: [],
    methods: [
      {
        name: "serialize",
        params: [{ name: "root", type: "TreeNode" }],
        return_type: "str",
      },
      {
        name: "deserialize",
        params: [{ name: "data", type: "str" }],
        return_type: "TreeNode",
      },
    ],
  },
};

const METADATA_URL =
  "https://raw.githubusercontent.com/neetcode-gh/leetcode/main/.problemSiteData.json";

const GRAPHQL_QUERY = `
query questionData($titleSlug: String!) {
  question(titleSlug: $titleSlug) {
    title
    titleSlug
    difficulty
    content
    exampleTestcases
    sampleTestCase
    metaData
    hints
    codeDefinition
    categoryTitle
  }
}`;

function decodeHtml(input) {
  return input
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;/g, "'")
    .replace(/&ldquo;|&rdquo;/g, '"')
    .replace(/&rsquo;|&lsquo;/g, "'");
}

function stripTags(input) {
  return decodeHtml(
    input
      .replace(/<sup>(.*?)<\/sup>/g, "^$1")
      .replace(/<code>(.*?)<\/code>/g, "`$1`")
      .replace(/<li>/g, "- ")
      .replace(/<\/li>/g, "\n")
      .replace(/<br\s*\/?>/g, "\n")
      .replace(/<\/p>/g, "\n\n")
      .replace(/<\/pre>/g, "\n")
      .replace(/<[^>]+>/g, "")
  )
    .replace(/\r/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function slugFromLink(link) {
  return String(link || "").replace(/\/+$/, "").split("/").filter(Boolean).pop();
}

function toSnakeCase(name) {
  return String(name || "")
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

function mapType(typeName) {
  const raw = String(typeName || "").trim();
  if (!raw) return "Any";
  if (raw.endsWith("[]")) {
    return `List[${mapType(raw.slice(0, -2))}]`;
  }
  const listMatch = raw.match(/^list<(.*)>$/i);
  if (listMatch) {
    return `List[${mapType(listMatch[1])}]`;
  }
  const map = {
    integer: "int",
    string: "str",
    boolean: "bool",
    double: "float",
    number: "float",
    char: "str",
    character: "str",
    ListNode: "ListNode",
    TreeNode: "TreeNode",
    Node: "Node",
    void: "None",
  };
  return map[raw] || raw;
}

function parseLooseValue(source) {
  const text = String(source || "").trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {}
  if (/^-?\d+$/.test(text)) return Number.parseInt(text, 10);
  if (/^-?\d+\.\d+$/.test(text)) return Number.parseFloat(text);
  if (text === "true") return true;
  if (text === "false") return false;
  if (text === "null") return null;
  return text;
}

function pruneSizeParams(params) {
  const out = [];
  for (const param of params) {
    const name = String(param.name || "");
    if (
      /size$/i.test(name) &&
      out.length > 0 &&
      /^List\[/.test(String(out[out.length - 1].type || ""))
    ) {
      continue;
    }
    out.push(param);
  }
  return out;
}

function cleanImportedText(text) {
  return decodeHtml(String(text || ""))
    .replace(/```[a-z]*\n?/gi, "")
    .replace(/```/g, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/&nbsp;/g, " ")
    .replace(/\*\*Example\s+(\d+):\*\*/gi, "Example $1:")
    .replace(/\*\*Constraints:\*\*/gi, "Constraints:")
    .replace(/\*\*Follow up\*\*:?/gi, "Follow up:")
    .replace(/\*\*Note:\*\*/gi, "Note:")
    .replace(/\r/g, "")
    .trim();
}

function trimTrailingNonProblemContent(text) {
  const cleaned = cleanImportedText(text);
  const markers = [
    /\n\s*Topics\b/i,
    /\n\s*Recommended Time/i,
    /\n\s*Hint 1\b/i,
    /\n\s*Company Tags\b/i,
    /\n\s*<details\b/i,
  ];
  let end = cleaned.length;
  for (const marker of markers) {
    const match = cleaned.match(marker);
    if (match && typeof match.index === "number") {
      end = Math.min(end, match.index);
    }
  }
  return cleaned.slice(0, end).trim();
}

function parseExampleBlocks(text) {
  const cleaned = trimTrailingNonProblemContent(text);
  const blocks = [...cleaned.matchAll(/Example\s+\d+:\s*([\s\S]*?)(?=\n\s*Example\s+\d+:|\n\s*Constraints:|\n\s*Follow up\b|$)/gi)];
  return blocks.map((match) => {
    const block = match[1].trim();
    const inputMatch = block.match(/Input:?\s*([\s\S]*?)(?=\n\s*Output:|\n\s*Explanation:|$)/i);
    const outputMatch = block.match(/Output:?\s*([\s\S]*?)(?=\n\s*Explanation:|$)/i);
    const explanationMatch = block.match(/Explanation:?\s*([\s\S]*)$/i);
    return {
      input: (inputMatch ? inputMatch[1] : "").trim(),
      output: (outputMatch ? outputMatch[1] : "").trim(),
      explanation: (explanationMatch ? explanationMatch[1] : "").trim(),
    };
  });
}

function splitTopLevel(source) {
  const parts = [];
  let start = 0;
  let depth = 0;
  let quote = "";
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    const prev = i > 0 ? source[i - 1] : "";
    if (quote) {
      if (ch === quote && prev !== "\\") quote = "";
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === "[" || ch === "(" || ch === "{") depth += 1;
    if (ch === "]" || ch === ")" || ch === "}") depth -= 1;
    if (ch === "," && depth === 0) {
      parts.push(source.slice(start, i).trim());
      start = i + 1;
    }
  }
  const tail = source.slice(start).trim();
  if (tail) parts.push(tail);
  return parts;
}

function parseFunctionArgsFromInput(inputText, paramNames) {
  const text = cleanImportedText(inputText);
  if (!text) return [];
  if (paramNames.length === 1 && !new RegExp(`\\b${paramNames[0]}\\s*=`).test(text)) {
    const assignmentMatch = text.match(/^\s*\w+\s*=\s*([\s\S]+)$/);
    return [parseLooseValue((assignmentMatch ? assignmentMatch[1] : text).trim())];
  }

  const values = [];
  for (let i = 0; i < paramNames.length; i += 1) {
    const name = paramNames[i];
    const next = paramNames[i + 1];
    const startMatch = text.match(new RegExp(`\\b${name}\\s*=`, "i"));
    if (!startMatch || typeof startMatch.index !== "number") {
      return [];
    }
    const start = startMatch.index + startMatch[0].length;
    let end = text.length;
    if (next) {
      const nextRe = new RegExp(`\\b${next}\\s*=`, "i");
      const rest = text.slice(start);
      const nextMatch = rest.match(nextRe);
      if (nextMatch && typeof nextMatch.index === "number") {
        end = start + nextMatch.index;
      }
    }
    values.push(parseLooseValue(text.slice(start, end).replace(/,\s*$/, "").trim()));
  }
  return values;
}

function extractBracketArrays(text) {
  const arrays = [];
  let start = -1;
  let depth = 0;
  let quote = "";
  const cleaned = cleanImportedText(text);
  for (let i = 0; i < cleaned.length; i += 1) {
    const ch = cleaned[i];
    const prev = i > 0 ? cleaned[i - 1] : "";
    if (quote) {
      if (ch === quote && prev !== "\\") quote = "";
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === "[") {
      if (depth === 0) start = i;
      depth += 1;
    } else if (ch === "]") {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        arrays.push(cleaned.slice(start, i + 1));
        start = -1;
      }
    }
  }
  return arrays;
}

function extractConstraintLines(content) {
  const match = content.match(/Constraints:<\/strong><\/p>\s*<ul>([\s\S]*?)<\/ul>/i);
  if (!match) return [];
  return [...match[1].matchAll(/<li>([\s\S]*?)<\/li>/gi)]
    .map((entry) => stripTags(entry[1]))
    .filter(Boolean);
}

function extractPreBlocks(content) {
  if (!content) return [];
  return [...content.matchAll(/<pre>([\s\S]*?)<\/pre>/gi)].map((match) => match[1]);
}

function extractOutputsAndExplanations(content) {
  return extractPreBlocks(content).map((block) => {
    const text = stripTags(block);
    const outputMatch = text.match(/Output:?\s*([\s\S]*?)(?=\n\s*Explanation:?\s*|$)/i);
    const explanationMatch = text.match(/Explanation:?\s*([\s\S]*)$/i);
    return {
      outputText: outputMatch ? outputMatch[1].trim() : "",
      explanation: explanationMatch ? explanationMatch[1].trim() : "",
    };
  });
}

function buildDescription(content) {
  if (!content) return "";
  const cleaned = stripTags(content);
  const constraintsIndex = cleaned.indexOf("Constraints:");
  if (constraintsIndex >= 0) {
    return cleaned.slice(0, constraintsIndex).trim();
  }
  return cleaned;
}

async function fetchNeetcodeFallback(slug) {
  const response = await fetch(`https://neetcode.io/solutions/${slug}`);
  if (!response.ok) {
    throw new Error(`NeetCode fallback ${response.status} for ${slug}`);
  }
  const html = await response.text();
  const match = html.match(/<meta name="description" content="([\s\S]*?)"\s*\/?>/i);
  if (!match) {
    throw new Error(`Missing NeetCode fallback description for ${slug}`);
  }
  return decodeHtml(match[1]);
}

function extractFallbackConstraints(text) {
  const cleaned = trimTrailingNonProblemContent(text);
  const match = cleaned.match(/Constraints:\s*([\s\S]*?)(?:Follow up:|$)/i);
  if (!match) return [];
  return match[1]
    .split("\n")
    .map((line) => line.replace(/^\s*[\-\*]\s*/, "").trim())
    .filter(Boolean);
}

function extractFallbackOutputs(text) {
  const cleaned = trimTrailingNonProblemContent(text);
  return [...cleaned.matchAll(/Output:\s*([\s\S]*?)(?=\n\s*Explanation:|\n\s*Example\s+\d+:|\n\s*Constraints:|\n\s*Follow up\b|$)/gi)]
    .map((match) => match[1].trim().replace(/```[a-z]*|```/gi, "").trim())
    .filter(Boolean);
}

function buildFallbackDescription(text) {
  const cleaned = trimTrailingNonProblemContent(text);
  const match = cleaned.match(/^([\s\S]*?)(?:Example 1:|Constraints:|Follow up:)/i);
  return (match ? match[1] : cleaned).trim();
}

function buildHintPlan(hints, title) {
  const list = Array.isArray(hints) ? hints.filter(Boolean).map((hint) => stripTags(hint)) : [];
  if (list.length === 0) {
    return {
      level_1: `Break down the core operation in ${title}.`,
      level_2: "Look for the data structure or traversal pattern that avoids repeated work.",
      level_3: "Use the constraints and examples to narrow the intended time complexity.",
      level_4: "Implement the direct approach that maintains the required invariant step by step.",
    };
  }
  return {
    level_1: list[0],
    level_2: list[1] || list[0],
    level_3: list[2] || list[list.length - 1],
    level_4: list[list.length - 1],
  };
}

function buildFunctionStarter(functionName, params) {
  const names = params.map((param) => param.name).join(", ");
  return `def ${functionName}(${names}):\n    pass\n`;
}

function buildClassStarter(className, constructorParams, methods) {
  const lines = [`class ${className}:`];
  const initArgs = ["self", ...constructorParams.map((param) => param.name)].join(", ");
  lines.push(`    def __init__(${initArgs}):`);
  lines.push("        pass");
  lines.push("");
  for (const method of methods) {
    const args = ["self", ...method.params.map((param) => param.name)].join(", ");
    lines.push(`    def ${method.name}(${args}):`);
    lines.push("        pass");
    lines.push("");
  }
  return `${lines.join("\n").trimEnd()}\n`;
}

function splitExampleLines(exampleTestcases, groupSize) {
  const lines = String(exampleTestcases || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (groupSize <= 0) return [];
  const groups = [];
  for (let i = 0; i < lines.length; i += groupSize) {
    groups.push(lines.slice(i, i + groupSize));
  }
  return groups;
}

function buildFunctionExamples(question, meta, slug, sourceText) {
  const parsedBlocks = parseExampleBlocks(sourceText);
  if (parsedBlocks.length > 0) {
    const examples = [];
    const visibleTests = [];
    for (const block of parsedBlocks) {
      const args = parseFunctionArgsFromInput(block.input, meta.params.map((param) => param.name));
      if (args.length !== meta.params.length) continue;
      examples.push({
        input: block.input,
        output: block.output,
        ...(block.explanation ? { explanation: block.explanation } : {}),
      });
      visibleTests.push({ args, expected: parseLooseValue(block.output) });
    }
    return {
      examples,
      visibleTests,
      hiddenTests: [],
      comparison:
        COMPARISON_BY_SLUG[slug] ||
        (String(meta.return?.type || "").toLowerCase() === "void" ? "mutates_first_arg" : ""),
    };
  }

  const blocks = extractOutputsAndExplanations(question.content);
  const groupedInputs = splitExampleLines(question.exampleTestcases, meta.params.length);
  const limit = Math.min(groupedInputs.length, blocks.length);
  const examples = [];
  const visibleTests = [];
  for (let i = 0; i < limit; i += 1) {
    const args = groupedInputs[i].map(parseLooseValue);
    const outputValue = parseLooseValue(blocks[i].outputText);
    const inputText = groupedInputs[i]
      .map((value, index) => `${meta.params[index].name} = ${value}`)
      .join(", ");
    examples.push({
      input: inputText,
      output: blocks[i].outputText,
      ...(blocks[i].explanation ? { explanation: blocks[i].explanation } : {}),
    });
    visibleTests.push({ args, expected: outputValue });
  }
  return {
    examples,
    visibleTests,
    hiddenTests: [],
    comparison:
      COMPARISON_BY_SLUG[slug] ||
      (String(meta.return?.type || "").toLowerCase() === "void" ? "mutates_first_arg" : ""),
  };
}

function buildClassExamples(question, sourceText) {
  const parsedBlocks = parseExampleBlocks(sourceText);
  if (parsedBlocks.length > 0) {
    const examples = [];
    const visibleTests = [];
    for (const block of parsedBlocks) {
      const arrays = extractBracketArrays(block.input);
      if (arrays.length < 2) continue;
      examples.push({
        input: block.input,
        output: block.output,
        ...(block.explanation ? { explanation: block.explanation } : {}),
      });
      visibleTests.push({
        ops: parseLooseValue(arrays[0]),
        args: parseLooseValue(arrays[1]),
        expected: parseLooseValue(block.output),
      });
    }
    return {
      examples,
      visibleTests,
      hiddenTests: [],
      comparison: "",
    };
  }

  const blocks = extractOutputsAndExplanations(question.content);
  const groups = splitExampleLines(question.exampleTestcases, 2);
  const limit = Math.min(groups.length, blocks.length);
  const examples = [];
  const visibleTests = [];
  for (let i = 0; i < limit; i += 1) {
    const ops = parseLooseValue(groups[i][0]);
    const args = parseLooseValue(groups[i][1]);
    const expected = parseLooseValue(blocks[i].outputText);
    examples.push({
      input: `${groups[i][0]}\n${groups[i][1]}`,
      output: blocks[i].outputText,
      ...(blocks[i].explanation ? { explanation: blocks[i].explanation } : {}),
    });
    visibleTests.push({ ops, args, expected });
  }
  return {
    examples,
    visibleTests,
    hiddenTests: [],
    comparison: "",
  };
}

async function fetchJson(url, init) {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  return response.json();
}

async function fetchQuestion(slug) {
  const body = JSON.stringify({
    query: GRAPHQL_QUERY,
    variables: { titleSlug: slug },
  });
  const response = await fetch("https://leetcode.com/graphql", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
  if (!response.ok) {
    throw new Error(`GraphQL ${response.status} for ${slug}`);
  }
  const payload = await response.json();
  if (!payload?.data?.question) {
    throw new Error(`Missing question data for ${slug}`);
  }
  return payload.data.question;
}

async function writeProblemFile(targetRoot, problem) {
  const outDir = path.join(targetRoot, problem.category);
  await mkdir(outDir, { recursive: true });
  await writeFile(
    path.join(outDir, `${problem.id}.json`),
    `${JSON.stringify(problem, null, 2)}\n`,
    "utf8"
  );
}

async function main() {
  const metadata = await fetchJson(METADATA_URL);
  const neetcode150 = metadata.filter((item) => item.neetcode150 === true);

  for (const root of [SHARED_DIR, BACKEND_DIR, RUNNER_DIR]) {
    await rm(root, { recursive: true, force: true });
    await mkdir(root, { recursive: true });
  }

  const generated = [];
  for (const item of neetcode150) {
    const slug = slugFromLink(item.link);
    const category = PATTERN_TO_CATEGORY[item.pattern];
    if (!category) {
      throw new Error(`Unknown category pattern: ${item.pattern}`);
    }

    const question = await fetchQuestion(slug);
    const meta = JSON.parse(question.metaData || "{}");
    const hints = buildHintPlan(question.hints, question.title);
    const executionMode = meta.systemdesign || CLASS_OVERRIDES[slug] ? "class" : "function";

    let fallbackText = "";
    if (!question.content) {
      fallbackText = await fetchNeetcodeFallback(slug);
    }
    const sourceText = question.content ? stripTags(question.content) : fallbackText;

    let problem;
    if (executionMode === "class") {
      const override = CLASS_OVERRIDES[slug];
      const className = override?.className || meta.classname || question.title.replace(/\s+/g, "");
      const constructorParams = pruneSizeParams((override?.constructorParams || meta.constructor?.params || []).map((param, index) => ({
        name: param.name || `arg${index + 1}`,
        type: mapType(param.type),
      })));
      const methods = (override?.methods || meta.methods || []).map((method) => ({
        name: method.name,
        params: pruneSizeParams((method.params || []).map((param) => ({
          name: param.name,
          type: mapType(param.type),
        }))),
        return_type: mapType(method.return_type || method.return?.type || "None"),
      }));
      const classExamples = buildClassExamples(question, sourceText);
      if (
        classExamples.visibleTests.length === 0 &&
        (slug === "encode-and-decode-strings" || slug === "serialize-and-deserialize-binary-tree")
      ) {
        const inputName = slug === "encode-and-decode-strings" ? "dummy_input" : "root";
        for (const block of parseExampleBlocks(sourceText)) {
          const parsedArgs = parseFunctionArgsFromInput(block.input, [inputName]);
          if (parsedArgs.length !== 1) continue;
          classExamples.examples.push({
            input: block.input,
            output: block.output,
            ...(block.explanation ? { explanation: block.explanation } : {}),
          });
          classExamples.visibleTests.push({
            args: parsedArgs,
            expected: parseLooseValue(block.output),
          });
        }
      }
      const fallbackOutputs = extractFallbackOutputs(fallbackText);
      if (classExamples.visibleTests.length === 0 && question.exampleTestcases) {
        const groups = splitExampleLines(question.exampleTestcases, 2);
        for (let i = 0; i < Math.min(groups.length, fallbackOutputs.length); i += 1) {
          classExamples.examples.push({
            input: `${groups[i][0]}\n${groups[i][1]}`,
            output: fallbackOutputs[i],
          });
          classExamples.visibleTests.push({
            ops: parseLooseValue(groups[i][0]),
            args: parseLooseValue(groups[i][1]),
            expected: parseLooseValue(fallbackOutputs[i]),
          });
        }
      }
      problem = {
        id: slug,
        title: question.title,
        difficulty: String(question.difficulty || "").toLowerCase(),
        category,
        description: question.content ? buildDescription(question.content) : buildFallbackDescription(fallbackText),
        examples: classExamples.examples,
        constraints: question.content ? extractConstraintLines(question.content) : extractFallbackConstraints(fallbackText),
        execution_mode: "class",
        class_name: className,
        function_name: className,
        starter_code: buildClassStarter(className, constructorParams, methods),
        parameters: constructorParams,
        methods: methods.map((method) => ({
          name: method.name,
          params: method.params,
          return_type: method.return_type,
        })),
        expected_return_type: "class",
        comparison: COMPARISON_BY_SLUG[slug] || "",
        visible_tests: classExamples.visibleTests,
        hidden_tests: classExamples.hiddenTests,
        hint_plan: hints,
        canonical_solution_summary: hints.level_4,
        disallowed_full_solution_exposure: true,
      };
    } else {
      const functionName = toSnakeCase(meta.name || slug);
      let parameters = pruneSizeParams((meta.params || []).map((param) => ({
        name: param.name,
        type: mapType(param.type),
      })));
      if (slug === "clone-graph") {
        parameters = [{ name: "node", type: "GraphNode" }];
      }
      if (slug === "copy-list-with-random-pointer") {
        parameters = [{ name: "head", type: "RandomListNode" }];
      }
      const funcExamples = buildFunctionExamples(question, { ...meta, params: parameters }, slug, sourceText);
      const fallbackOutputs = extractFallbackOutputs(fallbackText);
      if (funcExamples.visibleTests.length === 0 && question.exampleTestcases) {
        const groupedInputs = splitExampleLines(question.exampleTestcases, parameters.length);
        for (let i = 0; i < Math.min(groupedInputs.length, fallbackOutputs.length); i += 1) {
          const args = groupedInputs[i].map(parseLooseValue);
          funcExamples.examples.push({
            input: groupedInputs[i]
              .map((value, index) => `${parameters[index].name} = ${value}`)
              .join(", "),
            output: fallbackOutputs[i],
          });
          funcExamples.visibleTests.push({
            args,
            expected: parseLooseValue(fallbackOutputs[i]),
          });
        }
      }
      problem = {
        id: slug,
        title: question.title,
        difficulty: String(question.difficulty || "").toLowerCase(),
        category,
        description: question.content ? buildDescription(question.content) : buildFallbackDescription(fallbackText),
        examples: funcExamples.examples,
        constraints: question.content ? extractConstraintLines(question.content) : extractFallbackConstraints(fallbackText),
        execution_mode: "function",
        class_name: "",
        function_name: functionName,
        starter_code: buildFunctionStarter(functionName, parameters),
        parameters,
        expected_return_type:
          slug === "clone-graph" ? "GraphNode" : slug === "copy-list-with-random-pointer" ? "RandomListNode" : mapType(meta.return?.type || "Any"),
        comparison: funcExamples.comparison,
        visible_tests: funcExamples.visibleTests,
        hidden_tests: funcExamples.hiddenTests,
        hint_plan: hints,
        canonical_solution_summary: hints.level_4,
        disallowed_full_solution_exposure: true,
      };
    }

    generated.push(problem);
    await writeProblemFile(SHARED_DIR, problem);
    await writeProblemFile(BACKEND_DIR, problem);
    await writeProblemFile(RUNNER_DIR, problem);
    console.log(`Generated ${problem.id}`);
  }

  await writeFile(
    path.join(ROOT, "scripts", "neetcode150-summary.json"),
    `${JSON.stringify(
      generated.map((problem) => ({
        id: problem.id,
        title: problem.title,
        category: problem.category,
        difficulty: problem.difficulty,
        execution_mode: problem.execution_mode,
      })),
      null,
      2
    )}\n`,
    "utf8"
  );

  console.log(`Generated ${generated.length} problems.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
