import PgSimplifyInflectorPlugin from "@graphile-contrib/pg-simplify-inflector";
import { Express, Request, Response } from "express";
import { join } from "path";
import { makePluginHook, postgraphile, PostGraphileOptions, } from "postgraphile";

import RemoveQueryQueryPlugin from "../plugins/removeQueryQueryPlugin";
import handleErrors from "../utils/handleErrors";
import { getRootPgPool } from "./installDatabasePools";

const isDev = process.env.NODE_ENV === "development";
const isTest = process.env.NODE_ENV === "test";

const pluginHook = makePluginHook([
  // If we have a Graphile Pro license, then enable the plugin
  // ...(process.env.GRAPHILE_LICENSE ? [GraphilePro] : []),
]);

export function getPostGraphileOptions() {
  const options: PostGraphileOptions<Request, Response> = {
    // This is for PostGraphile server plugins: https://www.graphile.org/postgraphile/plugins/
    pluginHook,

    // This is so that PostGraphile installs the watch fixtures, it's also needed to enable live queries
    ownerConnectionString: process.env.DATABASE_URL,

    // Authentification
    jwtSecret: process.env.SECRET,
    jwtPgTypeIdentifier: '',

    // On production we still want to start even if the database isn't available.
    // On development, we want to deal nicely with issues in the database.
    // For these reasons, we're going to keep retryOnInitFail enabled for both environments.
    retryOnInitFail: !isTest,

    // enableQueryBatching: On the client side, use something like apollo-link-batch-http to make use of this
    enableQueryBatching: true,

    // dynamicJson: instead of inputting/outputting JSON as strings, input/output raw JSON objects
    dynamicJson: true,

    // ignoreRBAC=false: honour the permissions in your DB - don't expose what you don't GRANT
    ignoreRBAC: false,

    // ignoreIndexes=false: honour your DB indexes - only expose things that are fast
    ignoreIndexes: false,

    // setofFunctionsContainNulls=false: reduces the number of nulls in your schema
    setofFunctionsContainNulls: false,

    // Enable GraphiQL in development
    graphiql: isDev || !!process.env.ENABLE_GRAPHIQL,

    // Use a fancier GraphiQL with `prettier` for formatting, and header editing.
    enhanceGraphiql: true,

    // Allow EXPLAIN in development (you can replace this with a callback function if you want more control)
    allowExplain: isDev,

    // Disable query logging - we're using morgan
    disableQueryLog: true,

    // Custom error handling
    handleErrors,

    // Automatically update GraphQL schema when database changes
    watchPg: isDev,

    // Keep data/schema.graphql up to date
    sortExport: true,
    exportGqlSchemaPath: isDev
      ? join(__dirname, '..', '..', 'data', 'schema.graphql')
      : undefined,

    /*
     * Plugins to enhance the GraphQL schema, see:
     *   https://www.graphile.org/postgraphile/extending/
     */
    appendPlugins: [
      // PostGraphile adds a `query: Query` field to `Query` for Relay 1
      // compatibility. We don't need that.
      RemoveQueryQueryPlugin,

      // Simplifies the field names generated by PostGraphile.
      PgSimplifyInflectorPlugin,
    ],

    graphileBuildOptions: {
      /*
       * Any properties here are merged into the settings passed to each Graphile
       * Engine plugin - useful for configuring how the plugins operate.
       */

      // Makes all SQL function arguments except those with defaults non-nullable
      pgStrictFunctions: true,
    },

    /*
     * Postgres transaction settings for each GraphQL query/mutation to
     * indicate to Postgres who is attempting to access the resources. These
     * will be referenced by RLS policies/triggers/etc.
     *
     * Settings set here will be set using the equivalent of `SET LOCAL`, so
     * certain things are not allowed. You can override Postgres settings such
     * as 'role' and 'search_path' here; but for settings indicating the
     * current user, session id, or other privileges to be used by RLS policies
     * the setting names must contain at least one and at most two period
     * symbols (`.`), and the first segment must not clash with any Postgres or
     * extension settings. We find `jwt.claims.*` to be a safe namespace,
     * whether or not you're using JWTs.
     */
    async pgSettings(_req) {
      // TODO: Add auth
      return {
        // Everyone uses the "visitor" role currently
        role: process.env.DATABASE_VISITOR,
      };
    },

    // Pro plugin options (requires process.env.GRAPHILE_LICENSE)
    // defaultPaginationCap:
    //   parseInt(process.env.GRAPHQL_PAGINATION_CAP || "", 10) || 50,
    // graphqlDepthLimit:
    //   parseInt(process.env.GRAPHQL_DEPTH_LIMIT || "", 10) || 12,
    // graphqlCostLimit:
    //   parseInt(process.env.GRAPHQL_COST_LIMIT || "", 10) || 30000,
    // exposeGraphQLCost:
    //   (parseInt(process.env.HIDE_QUERY_COST || "", 10) || 0) < 1,
    // readReplicaPgPool ...,
  };
  return options;
}

export default function installPostGraphile(app: Express) {
  const rootPgPool = getRootPgPool(app);
  const middleware = postgraphile<Request, Response>(
    rootPgPool,
    "app_public",
    getPostGraphileOptions()
  );

  app.set("postgraphileMiddleware", middleware);
  app.use(middleware);
}