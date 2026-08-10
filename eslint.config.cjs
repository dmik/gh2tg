// eslint.config.cjs
// Flat config + CommonJS. Safe for `"type": "module"` projects.


const spaceBeforeComputedBracket =
{
  meta :
  {
    type : "layout",
    fixable : "whitespace",
    schema : [],
    messages :
    {
      expected : "Expected a space before '[' in computed member access.",
    }
  },

  create (context)
  {
    const source = context.getSourceCode ();

    function check (node)
    {
      if (! node.computed) return;

      const objectToken = source.getLastToken (node.object);
      const bracketToken = source.getTokenAfter (
        node.object,
        t => t.value === "["
      );

      if (! objectToken || ! bracketToken) return;

      // Do not break optional chaining: obj?.[0]
      const prevToBracket = source.getTokenBefore (bracketToken, { includeComments : false });
      if (prevToBracket && prevToBracket.value === "?.") return;

      const between = source.text.slice (
        objectToken.range [1],
        bracketToken.range [0]
      );

      if (/\s/.test (between)) return;

      context.report (
      {
        node,
        messageId : "expected",
        fix (fixer)
        {
          return fixer.insertTextAfter (objectToken, " ");
        }
      });
    }

    return {
      MemberExpression : check,
      ChainExpression (node)
      {
        if (node.expression?.type === "MemberExpression")
        {
          check (node.expression);
        }
      }
    };
  }
};


const spaceBeforeCallParen =
{
  meta :
  {
    type : "layout",
    fixable : "whitespace",
    schema : [],
    messages : { expected : "Expected a space before '(' in call." }
  },

  create (context)
  {
    const source = context.getSourceCode ();

    function checkCall (node)
    {
      // node.callee (...)  -> enforce space between callee and '('
      const calleeToken = source.getLastToken (node.callee);
      const parenToken = source.getTokenAfter (node.callee, t => t.value === "(");
      if (! calleeToken || ! parenToken) return;

      // Do not break optional chaining: obj?.[0]
      const prevToParen = source.getTokenBefore (parenToken, { includeComments : false });
      if (prevToParen && prevToParen.value === "?.") return;

      const between = source.text.slice (calleeToken.range [1], parenToken.range [0]);
      if (/\s/.test (between)) return;

      context.report (
      {
        node,
        messageId : "expected",
        fix (fixer)
        {
          return fixer.insertTextAfter (calleeToken, " ");
        }
      });
    }

    return {
      CallExpression : checkCall,
      NewExpression : checkCall
    };
  }
};


const forbidKrMultilineObject =
{
  meta :
  {
    type : "layout",
    fixable : "whitespace",
    schema : [],
    messages :
    {
      kr : "Multiline object literals must use Allman style."
    }
  },

  create (context)
  {
    const source = context.getSourceCode ();

    return {
      ObjectExpression (node)
      {
        const open = source.getFirstToken (node);
        const close = source.getLastToken (node);

        // single-line object → allow
        if (open.loc.start.line === close.loc.start.line) return;

        const line = source.lines [open.loc.start.line - 1];
        const before = line.slice (0, open.loc.start.column);

        // Exception: allow "({\n ... \n})" only when "({" starts the line (optionally indented)
        if (/^\s*\($/.test (before)) return;

        const prevTok = source.getTokenBefore (open, { includeComments : false });

        // Exception: allow `return {` form
        if (prevTok && prevTok.type === "Keyword" && prevTok.value === "return") return;

        // if "{" has non-whitespace before it on the same line → K&R
        if (/\S/.test (before))
        {
          context.report (
          {
            node,
            loc : open.loc,
            messageId : "kr",
            fix (fixer)
            {
              const prev = source.getTokenBefore (open);
              if (! prev) return null;

              const indent = line.match (/^\s*/) [0];
              return fixer.replaceTextRange (
                [ prev.range [1], open.range [0] ],
                "\n" + indent
              );
            }
          });
        }
      }
    };
  }
};


const forbidKrMultilineArray =
{
  meta :
  {
    type : "layout",
    fixable : "whitespace",
    schema : [],
    messages : { kr : "Multiline array literals must use Allman style." }
  },

  create (context)
  {
    const source = context.getSourceCode ();

    return {
      ArrayExpression (node)
      {
        const open = source.getFirstToken (node, t => t.value === "[");
        const close = source.getLastToken (node, t => t.value === "]");
        if (! open || ! close) return;

        // single-line array -> allow
        if (open.loc.start.line === close.loc.start.line) return;

        const line = source.lines [open.loc.start.line - 1] ?? "";
        const before = line.slice (0, open.loc.start.column);

        // Allow only "\n([ ... ])" case if you want it (optional):
        if (/^\s*\($/.test (before)) return;

        const prevTok = source.getTokenBefore (open, { includeComments : false });

        // Exception: allow `return {` form
        if (prevTok && prevTok.type === "Keyword" && prevTok.value === "return") return;

        // Forbid: something before '[' on same line (K&R multiline)
        if (/\S/.test (before))
        {
          const prev = source.getTokenBefore (open, { includeComments : false });
          context.report (
          {
            node,
            loc : open.loc,
            messageId : "kr",
            fix (fixer)
            {
              if (! prev) return null;
              const indent = (line.match (/^\s*/) || [ "" ]) [0];
              return fixer.replaceTextRange ([ prev.range [1], open.range [0] ], "\n" + indent);
            }
          });
        }
      }
    };
  }
};


const allmanWithIndent =
{
  meta :
  {
    type : "layout",
    fixable : "whitespace",
    schema :
    [
      {
        type : "object",
        properties : { allowSingleLine : { type : "boolean" } },
        additionalProperties : false
      }
    ],
    messages : { allman : "Expected '{' on its own line (Allman), properly indented." }
  },

  create (context)
  {
    const source = context.getSourceCode ();
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
      if (! open || ! close) return;

      if (allow1 && open.loc.start.line === close.loc.start.line) return;

      // If "{" is already the first non-ws on its line, assume OK.
      const line = source.lines [open.loc.start.line - 1] ?? "";
      const before = line.slice (0, open.loc.start.column);
      const hasNonWsBefore = /\S/.test (before);
      if (! hasNonWsBefore) return;

      // Only care when "{" is on same line as something else (K&R style).
      // Move it to next line and indent to match the line’s indent (Allman).
      context.report (
      {
        node,
        loc : open.loc,
        messageId : "allman",
        fix (fixer)
        {
          const prev = source.getTokenBefore (open, { includeComments : false });
          if (! prev) return null;

          const baseIndent = indentOfLine (open.loc.start.line);
          const gap = source.text.slice (prev.range [1], open.range [0]);
          if (/[^\s]/.test (gap)) return null;

          return fixer.replaceTextRange ([ prev.range [1], open.range [0] ], "\n" + baseIndent);
        }
      });
    }

    return { BlockStatement : checkBlock };
  }
};


module.exports =
[
  {
    files : [ "**/*.{js,cjs,mjs,jsx}" ],

    languageOptions :
    {
      ecmaVersion : "latest",
      sourceType : "module"
    },

    plugins :
    {
      "@stylistic" : require ("@stylistic/eslint-plugin"),
      "custom-style" :
      {
        rules :
        {
          "space-before-computed-bracket" : spaceBeforeComputedBracket,
          "space-before-call-paren" : spaceBeforeCallParen,
          "no-kr-multiline-object" : forbidKrMultilineObject,
          "no-kr-multiline-array" : forbidKrMultilineArray,
          "allman-block-brace" : allmanWithIndent
        }
      }
    },

    rules :
    {
      // This one is too strict/inflexible, we use @stylistic/indent
      // "indent" : [ "error", 2 ],

      // Terminating semicolun
      "semi" : [ "error", "always" ],
      "semi-spacing" : [ "error", { before : false, after : true } ],

      // Allman style for braces, brackets, etc

      // "brace-style" : [ "error", "allman", { "allowSingleLine" : true } ],
      "brace-style" : "off",
      "custom-style/allman-block-brace" : [ "error", { "allowSingleLine" : true } ],

      "space-before-blocks" : [ "error", "always" ],

      "custom-style/no-kr-multiline-object" : [ "error" ],
      "custom-style/no-kr-multiline-array" : [ "error" ],

      // Spacing

      "keyword-spacing" : [ "error", { before : true, after : true } ],
      "space-infix-ops" : "error",
      "comma-spacing" : [ "error", { before : false, after : true } ],
      "semi-spacing" : [ "error", { before : false, after : true } ],
      "space-unary-ops" :
      [
        "error",
        {
          "words" : true,
          "nonwords" : true,
          "overrides" :
          {
            "-" : false
          }
        }
      ],

      "space-in-parens" : [ "error", "never" ],
      "array-bracket-spacing" : [ "error", "always" ],
      "computed-property-spacing" : [ "error", "never" ],
      "space-before-blocks" : [ "error", "always" ],

      "@stylistic/space-before-function-paren" :
      [
        "error",
        {
          anonymous : "always",
          named : "always",
          asyncArrow : "always"
        }
      ],

      "no-whitespace-before-property" : "off",
      "custom-style/space-before-computed-bracket" : "error",

      "custom-style/space-before-call-paren" : "error",

      "operator-linebreak" : "off",

      "@stylistic/indent" :
      [
        "error", 2,
        {
          "SwitchCase" : 1,
          "MemberExpression" : 0,
          "CallExpression" : { "arguments" : 1 },
          "VariableDeclarator" : { "const" : 0, "let" : 0, "var" : 0 },
          "FunctionExpression" :
          {
            "parameters" : 0,
            "body" : 1
          },
          "ignoredNodes" :
          [
            "VariableDeclarator > ObjectExpression",
            "VariableDeclarator > ObjectExpression > Property",
            "AssignmentExpression > ObjectExpression",
            "AssignmentExpression > ObjectExpression > Property",
            "CallExpression > ArrowFunctionExpression",
            "CallExpression > ArrowFunctionExpression > *",
            "CallExpression[arguments.0.type='ArrowFunctionExpression']",
            "CallExpression[arguments.0.type='ObjectExpression']",
            "CallExpression[arguments.1.type='ObjectExpression']",
            "CallExpression[arguments.2.type='ObjectExpression']",
            "CallExpression[arguments.3.type='ObjectExpression']",
            "AssignmentExpression > ArrayExpression",
            "AssignmentExpression > ArrayExpression > *",
            "VariableDeclarator > ArrayExpression",
            "VariableDeclarator > ArrayExpression > *",
            "ClassBody > MethodDefinition",
            "ClassBody > PropertyDefinition"
          ]
        }
      ],

      "key-spacing" :
      [
        "error",
        {
          "beforeColon" : true,
          "afterColon" : true
        }
      ],

      "dot-location" : [ "error", "property" ],
    }
  }
];