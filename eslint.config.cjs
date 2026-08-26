// eslint.config.cjs
// Flat config + CommonJS. Safe for `"type": "module"` projects. Works with both JS and TS.

// This linter config implements the Allman brace style for better visual separation with spaces
// around punctuation to follow the rules of normal human-readable text (prose).

// For JS projects do:
//    npm install -D eslint @stylistic/eslint-plugin
// For TS projects do:
//    npm install -D eslint @stylistic/eslint-plugin typescript-eslint


function reportMissingSpaceBefore (context, node, token, excludedPreviousValues = [])
{
  if (! token)
    return;

  const source = context.sourceCode;
  const previous = source.getTokenBefore (token, { includeComments: false });
  if (! previous || excludedPreviousValues.includes (previous.value))
    return;

  const between = source.text.slice (previous.range [1], token.range [0]);
  if (/\s/.test (between))
    return;

  context.report (
  {
    node,
    loc: token.loc,
    messageId: "expected",
    fix (fixer)
    {
      return fixer.insertTextBefore (token, " ");
    }
  });
}


function checkPunctuationSpacing (context, node, tokens, index)
{
  const source = context.sourceCode;
  const punctuation = tokens [index];
  const previous = tokens [index - 1];
  const next = tokens [index + 1];

  if (previous && previous.loc.end.line === punctuation.loc.start.line)
  {
    const before = source.text.slice (previous.range [1], punctuation.range [0]);
    if (/\s/.test (before))
    {
      context.report (
      {
        node,
        loc: punctuation.loc,
        messageId: "unexpectedBefore",
        fix (fixer)
        {
          return fixer.removeRange ([ previous.range [1], punctuation.range [0] ]);
        }
      });
    }
  }

  if (next && next.loc.start.line === punctuation.loc.end.line)
  {
    const after = source.text.slice (punctuation.range [1], next.range [0]);
    if (! /\s/.test (after))
    {
      context.report (
      {
        node,
        loc: punctuation.loc,
        messageId: "expectedAfter",
        fix (fixer)
        {
          return fixer.insertTextAfter (punctuation, " ");
        }
      });
    }
  }
}


const spaceBeforeComputedBracket =
{
  meta:
  {
    type: "layout",
    fixable: "whitespace",
    schema: [],
    messages:
    {
      expected: "Expected a space before '[' in computed member access.",
    }
  },

  create (context)
  {
    const source = context.sourceCode;

    function check (node)
    {
      if (! node.computed)
        return;

      const bracketToken = source.getTokenAfter (
        node.object,
        t => t.value === "["
      );

      // Do not break optional chaining: obj?.[0]
      reportMissingSpaceBefore (context, node, bracketToken, [ "?." ]);
    }

    return {
      MemberExpression: check
    };
  }
};


const spaceBeforeCallParen =
{
  meta:
  {
    type: "layout",
    fixable: "whitespace",
    schema: [],
    messages: { expected: "Expected a space before '(' in call." }
  },

  create (context)
  {
    const source = context.sourceCode;

    function checkCall (node)
    {
      // Enforce a space immediately before the call parenthesis, including
      // after generic arguments: call <Type> (...).
      const parenToken = source.getTokenAfter (node.callee, t => t.value === "(");
      reportMissingSpaceBefore (context, node, parenToken, [ "?." ]);
    }

    return {
      CallExpression: checkCall,
      NewExpression: checkCall
    };
  }
};


const multilineLiteralAllman =
{
  meta:
  {
    type: "layout",
    fixable: "whitespace",
    schema: [],
    messages:
    {
      allman: "Multiline literals must use Allman style with braces aligned to their declaration."
    }
  },

  create (context)
  {
    const source = context.sourceCode;

    function indentOfLine (line1)
    {
      return (source.lines [line1 - 1]?.match (/^\s*/) || [ "" ]) [0];
    }

    function check (node, openValue, closeValue)
    {
      const open = source.getFirstToken (node, token => token.value === openValue);
      const close = source.getLastToken (node, token => token.value === closeValue);
      if (! open || ! close || open.loc.start.line === close.loc.start.line)
        return;

      const line = source.lines [open.loc.start.line - 1] ?? "";
      const before = line.slice (0, open.loc.start.column);

      // Allow a literal starting immediately after an opening parenthesis.
      if (/^\s*\($/.test (before))
        return;

      const previous = source.getTokenBefore (open, { includeComments: false });

      // Preserve the explicit `return {` / `return [` exception.
      if (previous?.type === "Keyword" && previous.value === "return")
        return;

      const declaration = [ "VariableDeclarator", "AssignmentExpression", "TSTypeAliasDeclaration" ]
      .includes (node.parent.type) ? node.parent : null;
      const expectedIndent = declaration ? indentOfLine (declaration.loc.start.line) : null;

      for (const delimiter of [ open, close ])
      {
        const isOnOwnLine = ! /\S/.test ((source.lines [delimiter.loc.start.line - 1] ?? "")
        .slice (0, delimiter.loc.start.column));
        if (isOnOwnLine && (expectedIndent === null || delimiter.loc.start.column === expectedIndent.length))
          continue;

        context.report (
        {
          node,
          loc: delimiter.loc,
          messageId: "allman",
          fix (fixer)
          {
            const indent = expectedIndent ?? indentOfLine (delimiter.loc.start.line);
            const tokenBefore = source.getTokenBefore (delimiter, { includeComments: false });
            if (! tokenBefore)
              return null;
            return fixer.replaceTextRange ([ tokenBefore.range [1], delimiter.range [0] ], "\n" + indent);
          }
        });
      }
    }

    return {
      ObjectExpression: node => check (node, "{", "}"),
      ArrayExpression: node => check (node, "[", "]"),
      TSTypeLiteral: node => check (node, "{", "}")
    };
  }
};


const allmanWithIndent =
{
  meta:
  {
    type: "layout",
    fixable: "whitespace",
    schema:
    [
      {
        type: "object",
        properties: { allowSingleLine: { type: "boolean" } },
        additionalProperties: false
      }
    ],
    messages:
    {
      allman: "Expected '{' on its own line (Allman), properly indented.",
      continuation: "Expected '{{keyword}}' on a new line after '}'."
    }
  },

  create (context)
  {
    const source = context.sourceCode;
    const opt = context.options [0] || {};
    const allow1 = ("allowSingleLine" in opt) ? !! opt.allowSingleLine : false;

    function indentOfLine (line1)
    {
      const line = source.lines [line1 - 1] ?? "";
      const m = line.match (/^\s*/);
      return m ? m [0] : "";
    }

    function checkBlock (node)
    {
      // node is a BlockStatement, we want its opening "{"
      const open = source.getFirstToken (node, t => t.value === "{");
      const close = source.getLastToken (node, t => t.value === "}");
      if (! open || ! close)
        return;

      if (allow1 && open.loc.start.line === close.loc.start.line)
        return;

      // If "{" is already the first non-ws on its line, assume OK.
      const line = source.lines [open.loc.start.line - 1] ?? "";
      const before = line.slice (0, open.loc.start.column);
      const hasNonWsBefore = /\S/.test (before);
      if (! hasNonWsBefore)
        return;

      // Only care when "{" is on same line as something else (K&R style).
      // Move it to next line and indent to match the line’s indent (Allman).
      context.report (
      {
        node,
        loc: open.loc,
        messageId: "allman",
        fix (fixer)
        {
          const prev = source.getTokenBefore (open, { includeComments: false });
          if (! prev)
            return null;

          const baseIndent = indentOfLine (open.loc.start.line);
          const gap = source.text.slice (prev.range [1], open.range [0]);
          if (/[^\s]/.test (gap))
            return null;

          return fixer.replaceTextRange ([ prev.range [1], open.range [0] ], "\n" + baseIndent);
        }
      });
    }

    function checkContinuation (node, keywordToken, close)
    {
      if (! keywordToken || ! close || close.value !== "}")
        return;
      if (close.loc.end.line !== keywordToken.loc.start.line)
        return;

      const gap = source.text.slice (close.range [1], keywordToken.range [0]);
      if (/[^\s]/.test (gap))
        return;

      context.report (
      {
        node,
        loc: keywordToken.loc,
        messageId: "continuation",
        data: { keyword: keywordToken.value },
        fix (fixer)
        {
          return fixer.replaceTextRange (
            [ close.range [1], keywordToken.range [0] ],
            "\n" + indentOfLine (keywordToken.loc.start.line)
          );
        }
      });
    }

    function checkCatch (node)
    {
      const catchToken = source.getFirstToken (node);
      if (! catchToken || catchToken.value !== "catch")
        return;

      const ancestors = source.getAncestors (node);
      const tryStatement = ancestors [ancestors.length - 1];
      const tryBlock = tryStatement?.type === "TryStatement" ? tryStatement.block : null;
      const close = tryBlock ? source.getLastToken (tryBlock) : null;
      checkContinuation (node, catchToken, close);
    }

    function checkElse (node)
    {
      if (! node.alternate)
        return;

      const close = source.getLastToken (node.consequent);
      const elseToken = source.getTokenAfter (node.consequent, { includeComments: false });
      if (! elseToken || elseToken.value !== "else")
        return;

      checkContinuation (node, elseToken, close);
    }

    function checkFinally (node)
    {
      if (! node.finalizer)
        return;

      const finallyToken = source.getTokenBefore (node.finalizer, { includeComments: false });
      if (! finallyToken || finallyToken.value !== "finally")
        return;

      const precedingBlock = node.handler ? node.handler.body : node.block;
      const close = source.getLastToken (precedingBlock);
      checkContinuation (node, finallyToken, close);
    }

    return {
      BlockStatement: checkBlock,
      SwitchStatement: checkBlock,
      CatchClause: checkCatch,
      IfStatement: checkElse,
      TryStatement: checkFinally,
      TSInterfaceBody: checkBlock,
      TSTypeLiteral: checkBlock,
      TSEnumBody: checkBlock,
      TSModuleBlock: checkBlock
    };
  }
};


const semicolonSpacing =
{
  meta:
  {
    type: "layout",
    fixable: "whitespace",
    schema: [],
    messages:
    {
      unexpectedBefore: "Unexpected space before semicolon.",
      expectedAfter: "Expected a space after semicolon."
    }
  },

  create (context)
  {
    const source = context.sourceCode;

    return {
      Program (node)
      {
        const tokens = source.getTokens (node, { includeComments: true });

        tokens.forEach ((semicolon, index) =>
        {
          if (semicolon.value !== ";")
            return;

          checkPunctuationSpacing (context, node, tokens, index);
        });
      }
    };
  }
};


const colonSpacing =
{
  meta:
  {
    type: "layout",
    fixable: "whitespace",
    schema: [],
    messages:
    {
      unexpectedBefore: "Unexpected space before colon.",
      expectedAfter: "Expected a space after colon.",
      unexpectedBeforeOptional: "Unexpected space before optional parameter marker."
    }
  },

  create (context)
  {
    const source = context.sourceCode;
    const excludedColons = new Set ();

    function excludeConditionalColon (consequent, alternate)
    {
      const colon = source.getTokensBetween (consequent, alternate)
      .find (token => token.value === ":");

      if (colon)
        excludedColons.add (colon.range [0]);
    }

    return {
      JSXNamespacedName (node)
      {
        const colon = source.getTokens (node).find (token => token.value === ":");
        if (colon)
          excludedColons.add (colon.range [0]);
      },

      ConditionalExpression (node)
      {
        excludeConditionalColon (node.consequent, node.alternate);
      },

      TSConditionalType (node)
      {
        excludeConditionalColon (node.trueType, node.falseType);
      },

      "Program:exit" (node)
      {
        const tokens = source.getTokens (node, { includeComments: true });

        tokens.forEach ((colon, index) =>
        {
          if (colon.value !== ":" || excludedColons.has (colon.range [0]))
            return;

          const previous = tokens [index - 1];
          if (previous?.value === "?")
          {
            const optionalTarget = tokens [index - 2];
            if (optionalTarget && optionalTarget.loc.end.line === previous.loc.start.line)
            {
              const beforeOptional = source.text.slice (
                optionalTarget.range [1],
                previous.range [0]
              );

              if (/\s/.test (beforeOptional))
              {
                context.report (
                {
                  node,
                  loc: previous.loc,
                  messageId: "unexpectedBeforeOptional",
                  fix (fixer)
                  {
                    return fixer.removeRange (
                      [ optionalTarget.range [1], previous.range [0] ]
                    );
                  }
                });
              }
            }
          }

          checkPunctuationSpacing (context, node, tokens, index);
        });
      }
    };
  }
};


const spaceBeforeGenericAngleBracket =
{
  meta:
  {
    type: "layout",
    fixable: "whitespace",
    schema: [],
    messages:
    {
      expected: "Expected a space before the generic '<'."
    }
  },

  create (context)
  {
    const source = context.sourceCode;

    function check (node)
    {
      const angleBracket = source.getFirstToken (node);
      if (! angleBracket || angleBracket.value !== "<")
        return;

      reportMissingSpaceBefore (context, node, angleBracket);
    }

    return {
      TSTypeParameterDeclaration: check,
      TSTypeParameterInstantiation: check
    };
  }
};


const spaceBeforeArrayTypeBracket =
{
  meta:
  {
    type: "layout",
    fixable: "whitespace",
    schema: [],
    messages:
    {
      expected: "Expected a space before '[]' in an array type."
    }
  },

  create (context)
  {
    const source = context.sourceCode;

    return {
      TSArrayType (node)
      {
        const bracket = source.getTokenAfter (
          node.elementType,
          token => token.value === "["
        );
        if (! bracket)
          return;

        reportMissingSpaceBefore (context, node, bracket);
      }
    };
  }
};


const sharedConfig =
{
    plugins:
    {
      "@stylistic": require ("@stylistic/eslint-plugin"),
      "custom-style":
      {
        rules:
        {
          "space-before-computed-bracket": spaceBeforeComputedBracket,
          "space-before-call-paren": spaceBeforeCallParen,
          "multiline-literal-allman": multilineLiteralAllman,
          "allman-block-brace": allmanWithIndent,
          "semicolon-spacing": semicolonSpacing,
          "colon-spacing": colonSpacing,
          "space-before-generic-angle-bracket": spaceBeforeGenericAngleBracket,
          "space-before-array-type-bracket": spaceBeforeArrayTypeBracket
        }
      }
    },

    rules:
    {
      // This one is too strict/inflexible, we use @stylistic/indent
      // "indent" : [ "error", 2 ],

      // Terminating semicolon

      "semi": [ "error", "always" ],
      "semi-spacing": "off",

      // Allman style for braces, brackets, etc

      // "brace-style" : [ "error", "allman", { "allowSingleLine" : true } ],
      "brace-style": "off",
      "custom-style/allman-block-brace": [ "error", { "allowSingleLine": true } ],

      "space-before-blocks": [ "error", "always" ],

      "custom-style/multiline-literal-allman": "error",
      "custom-style/semicolon-spacing": "error",
      "custom-style/colon-spacing": "error",
      "custom-style/space-before-generic-angle-bracket": "error",
      "custom-style/space-before-array-type-bracket": "error",
      "@stylistic/nonblock-statement-body-position": [ "error", "below" ],

      // Spacing

      "keyword-spacing": [ "error", { before: true, after: true } ],
      "space-infix-ops": "error",
      "comma-spacing": [ "error", { before: false, after: true } ],
      "space-unary-ops":
      [
        "error",
        {
          "words": true,
          "nonwords": true,
          "overrides":
          {
            "-": false
          }
        }
      ],

      "space-in-parens": [ "error", "never" ],
      "array-bracket-spacing": [ "error", "always" ],
      "object-curly-spacing": [ "error", "always" ],
      "computed-property-spacing": [ "error", "never" ],

      "@stylistic/space-before-function-paren":
      [
        "error",
        {
          anonymous: "always",
          named: "always",
          asyncArrow: "always"
        }
      ],

      "no-whitespace-before-property": "off",
      "custom-style/space-before-computed-bracket": "error",

      "custom-style/space-before-call-paren": "error",

      "operator-linebreak": "off",

      // Indent

      "@stylistic/indent":
      [
        "error", 2,
        {
          "SwitchCase": 1,
          "MemberExpression": 0,
          "CallExpression": { "arguments": 1 },
          "VariableDeclarator": { "const": 0, "let": 0, "var": 0 },
          "FunctionExpression":
          {
            "parameters": 0,
            "body": 1
          },
          "ignoredNodes":
          [
            "VariableDeclarator > ObjectExpression",
            "AssignmentExpression > ObjectExpression",
            "CallExpression > ArrowFunctionExpression",
            "CallExpression > ArrowFunctionExpression > *",
            "CallExpression[arguments.0.type='ArrowFunctionExpression']",
            "CallExpression[arguments.0.type='ObjectExpression']",
            "CallExpression[arguments.1.type='ObjectExpression']",
            "CallExpression[arguments.2.type='ObjectExpression']",
            "CallExpression[arguments.3.type='ObjectExpression']",
            "AssignmentExpression > ArrayExpression",
            "VariableDeclarator > ArrayExpression",
            "TSTypeAliasDeclaration > TSTypeLiteral",
            "ClassBody > MethodDefinition",
            "ClassBody > PropertyDefinition"
          ]
        }
      ],

      "key-spacing": "off",

      "dot-location": [ "error", "property" ],
    }
};


const javascriptConfig =
{
  files: [ "**/*.{js,cjs,mjs,jsx}" ],

  languageOptions:
  {
    ecmaVersion: "latest",
    sourceType: "module"
  },

  ...sharedConfig
};


const configs = [ javascriptConfig ];

// TypeScript support is optional
let tseslintPath;

try
{
  tseslintPath = require.resolve ("typescript-eslint");
}
catch (error)
{
  if (error?.code !== "MODULE_NOT_FOUND")
    throw error;
}

if (tseslintPath)
{
  // Load outside the resolution guard so missing transitive dependencies fail loudly.
  const tseslint = require (tseslintPath);

  configs.push (
  {
    files: [ "**/*.{ts,tsx,mts,cts}" ],

    languageOptions:
    {
      parser: tseslint.parser,
      ecmaVersion: "latest",
      sourceType: "module"
    },

    ...sharedConfig
  });
}


module.exports = configs;
