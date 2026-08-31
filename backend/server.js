const express = require("express");
const cors = require("cors");
const pool = require("./db");
require("dotenv").config();

const app = express();

app.use(cors());
app.use(express.json());

/* =====================================================
   DATABASE CONNECTION TEST
===================================================== */

app.get("/", (req, res) => {
    res.json({
        message: "TSEC Spatial Database API is running"
    });
});


/* =====================================================
   BUILDINGS
===================================================== */

/* GET ALL BUILDINGS */

app.get("/api/buildings", async (req, res) => {
    try {

        const [rows] = await pool.query(`
            SELECT
                building_id,
                name,
                code,
                ST_AsText(footprint) AS footprint
            FROM buildings
            ORDER BY building_id
        `);

        res.json(rows);

    } catch (error) {

        res.status(500).json({
            error: error.message
        });

    }
});


/* ADD BUILDING */

app.post("/api/buildings", async (req, res) => {

    try {

        const { name, code, coordinates } = req.body;

        if (!name || !code || !coordinates) {
            return res.status(400).json({
                error: "All fields are required"
            });
        }

        /*
            Expected coordinates:

            72.8480 19.1200,
            72.8485 19.1200,
            72.8485 19.1205,
            72.8480 19.1205
        */

        const points = coordinates
            .split(",")
            .map(point => point.trim())
            .filter(point => point.length > 0);

        if (points.length < 3) {
            return res.status(400).json({
                error: "A polygon requires at least 3 points"
            });
        }

        /*
            Close the polygon automatically.
        */

        if (points[0] !== points[points.length - 1]) {
            points.push(points[0]);
        }

        const polygon = `POLYGON((${points.join(", ")}))`;

        const [result] = await pool.query(
            `
            INSERT INTO buildings
            (name, code, footprint)

            VALUES
            (?, ?, ST_GeomFromText(?, 4326))
            `,
            [name, code.toUpperCase(), polygon]
        );

        res.status(201).json({
            message: "Building added successfully",
            building_id: result.insertId
        });

    } catch (error) {

        res.status(500).json({
            error: error.message
        });

    }

});


/* DELETE BUILDING */

app.delete("/api/buildings/:id", async (req, res) => {

    try {

        const { id } = req.params;

        await pool.query(
            "DELETE FROM buildings WHERE building_id = ?",
            [id]
        );

        res.json({
            message: "Building deleted successfully"
        });

    } catch (error) {

        if (error.code === "ER_ROW_IS_REFERENCED_2") {

            return res.status(400).json({
                error:
                    "Cannot delete building because Points of Interest or Paths are linked to it."
            });

        }

        res.status(500).json({
            error: error.message
        });

    }

});


/* =====================================================
   POINTS OF INTEREST
===================================================== */


/* GET ALL POIs */

app.get("/api/pois", async (req, res) => {

    try {

        const [rows] = await pool.query(`
            SELECT
                p.poi_id,
                p.name,
                p.category,
                p.building_id,

                b.name AS building_name,

                ST_X(p.location) AS longitude,
                ST_Y(p.location) AS latitude

            FROM points_of_interest p

            LEFT JOIN buildings b
            ON p.building_id = b.building_id

            ORDER BY p.poi_id
        `);

        res.json(rows);

    } catch (error) {

        res.status(500).json({
            error: error.message
        });

    }

});


/* ADD POI */

app.post("/api/pois", async (req, res) => {

    try {

        const {
            name,
            category,
            building_id,
            longitude,
            latitude
        } = req.body;


        if (
            !name ||
            !category ||
            !building_id ||
            longitude === undefined ||
            latitude === undefined
        ) {

            return res.status(400).json({
                error: "All fields are required"
            });

        }


        const allowedCategories = [
            "Lab",
            "Classroom",
            "Restroom",
            "Library",
            "Office",
            "Other"
        ];


        if (!allowedCategories.includes(category)) {

            return res.status(400).json({
                error: "Invalid category"
            });

        }


        const [result] = await pool.query(
            `
            INSERT INTO points_of_interest
            (
                name,
                category,
                building_id,
                location
            )

            VALUES
            (
                ?,
                ?,
                ?,
                ST_GeomFromText(
                    CONCAT('POINT(', ?, ' ', ?, ')'),
                    4326
                )
            )
            `,
            [
                name,
                category,
                building_id,
                longitude,
                latitude
            ]
        );


        res.status(201).json({

            message:
                "Point of Interest added successfully",

            poi_id:
                result.insertId

        });

    } catch (error) {

        res.status(500).json({
            error: error.message
        });

    }

});


/* DELETE POI */

app.delete("/api/pois/:id", async (req, res) => {

    try {

        const { id } = req.params;

        await pool.query(
            "DELETE FROM points_of_interest WHERE poi_id = ?",
            [id]
        );

        res.json({
            message: "Point of Interest deleted successfully"
        });

    } catch (error) {

        res.status(500).json({
            error: error.message
        });

    }

});


/* =====================================================
   PATHS
===================================================== */


/* GET ALL PATHS */

app.get("/api/paths", async (req, res) => {

    try {

        const [rows] = await pool.query(`
            SELECT

                pt.path_id,
                pt.name,

                b.name AS building_name,

                ST_AsText(pt.path_line) AS path_line

            FROM paths pt

            LEFT JOIN buildings b
            ON pt.building_id = b.building_id

            ORDER BY pt.path_id
        `);

        res.json(rows);

    } catch (error) {

        res.status(500).json({
            error: error.message
        });

    }

});


/* ADD PATH */

app.post("/api/paths", async (req, res) => {

    try {

        const {
            name,
            building_id,
            coordinates
        } = req.body;


        if (!name || !building_id || !coordinates) {

            return res.status(400).json({
                error: "All fields are required"
            });

        }


        const points = coordinates
            .split(",")
            .map(point => point.trim())
            .filter(point => point.length > 0);


        if (points.length < 2) {

            return res.status(400).json({
                error:
                    "A path requires at least 2 coordinate points"
            });

        }


        const lineString =
            `LINESTRING(${points.join(", ")})`;


        const [result] = await pool.query(
            `
            INSERT INTO paths
            (
                name,
                path_line,
                building_id
            )

            VALUES
            (
                ?,
                ST_GeomFromText(?, 4326),
                ?
            )
            `,
            [
                name,
                lineString,
                building_id
            ]
        );


        res.status(201).json({

            message:
                "Path added successfully",

            path_id:
                result.insertId

        });

    } catch (error) {

        res.status(500).json({
            error: error.message
        });

    }

});


/* DELETE PATH */

app.delete("/api/paths/:id", async (req, res) => {

    try {

        const { id } = req.params;

        await pool.query(
            "DELETE FROM paths WHERE path_id = ?",
            [id]
        );

        res.json({
            message: "Path deleted successfully"
        });

    } catch (error) {

        res.status(500).json({
            error: error.message
        });

    }

});


/* =====================================================
   DASHBOARD STATISTICS
===================================================== */

app.get("/api/stats", async (req, res) => {

    try {

        const [[buildingResult]] =
            await pool.query(
                "SELECT COUNT(*) AS total FROM buildings"
            );

        const [[poiResult]] =
            await pool.query(
                "SELECT COUNT(*) AS total FROM points_of_interest"
            );

        const [categories] =
            await pool.query(`
                SELECT
                    category,
                    COUNT(*) AS total
                FROM points_of_interest
                GROUP BY category
            `);


        res.json({

            buildings:
                buildingResult.total,

            pois:
                poiResult.total,

            categories

        });

    } catch (error) {

        res.status(500).json({
            error: error.message
        });

    }

});


/* =====================================================
   SPATIAL / DATABASE QUERIES
===================================================== */


/*
    QUERY 1
    Count POIs by category
*/

app.get("/api/queries/category-count", async (req, res) => {

    try {

        const [rows] = await pool.query(`
            SELECT
                category,
                COUNT(*) AS total_count

            FROM points_of_interest

            GROUP BY category
        `);

        res.json(rows);

    } catch (error) {

        res.status(500).json({
            error: error.message
        });

    }

});


/*
    QUERY 2
    Find all restrooms with coordinates
*/

app.get("/api/queries/restrooms", async (req, res) => {

    try {

        const [rows] = await pool.query(`
            SELECT

                name,

                ST_Y(location)
                AS latitude,

                ST_X(location)
                AS longitude

            FROM points_of_interest

            WHERE category = 'Restroom'

            ORDER BY name ASC
        `);

        res.json(rows);

    } catch (error) {

        res.status(500).json({
            error: error.message
        });

    }

});


/*
    QUERY 3
    Find POIs by building
*/

app.get("/api/queries/building/:code", async (req, res) => {

    try {

        const { code } = req.params;

        const [rows] = await pool.query(
            `
            SELECT

                p.name
                AS location_name,

                p.category,

                b.name
                AS building_name

            FROM points_of_interest p

            JOIN buildings b
            ON p.building_id =
               b.building_id

            WHERE b.code = ?
            `,
            [code.toUpperCase()]
        );

        res.json(rows);

    } catch (error) {

        res.status(500).json({
            error: error.message
        });

    }

});


/*
    QUERY 4
    Find POIs spatially contained
    inside building footprints
*/

app.get("/api/queries/inside-buildings", async (req, res) => {

    try {

        const [rows] = await pool.query(`
            SELECT

                p.name
                AS poi_name,

                b.name
                AS building_name

            FROM points_of_interest p

            JOIN buildings b

            ON ST_Contains(
                b.footprint,
                p.location
            )
        `);

        res.json(rows);

    } catch (error) {

        res.status(500).json({
            error: error.message
        });

    }

});


/*
    QUERY 5
    Find POIs near paths
*/

app.get("/api/queries/near-paths", async (req, res) => {

    try {

        const [rows] = await pool.query(`
            SELECT

                p.name
                AS poi_name,

                pt.name
                AS path_name

            FROM points_of_interest p

            JOIN paths pt

            ON ST_Distance(
                p.location,
                pt.path_line
            ) < 0.0005
        `);

        res.json(rows);

    } catch (error) {

        res.status(500).json({
            error: error.message
        });

    }

});


/* =====================================================
   SERVER
===================================================== */

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {

    console.log(
        `Server running on http://localhost:${PORT}`
    );

});