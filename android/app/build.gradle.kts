plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

val updateManifestUrl = (findProperty("updateManifestUrl") as String?)
    ?: "https://toranga.github.io/anitagame/version.json"
val versionCodeOverride = (findProperty("versionCodeOverride") as String?)?.toIntOrNull()

android {
    namespace = "com.toranga.dontdie"
    compileSdk = 36

    buildFeatures {
        buildConfig = true
    }

    defaultConfig {
        applicationId = "com.toranga.dontdie"
        minSdk = 21
        targetSdk = 36
        versionCode = versionCodeOverride ?: 9
        versionName = "2.0"
        buildConfigField("String", "UPDATE_MANIFEST_URL", "\"$updateManifestUrl\"")
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            // Sideload build. The debug keystore lives outside the repo (~/.android).
            signingConfig = signingConfigs.getByName("debug")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    lint {
        checkReleaseBuilds = false
    }
}

dependencies {
    implementation("androidx.webkit:webkit:1.12.1")
    testImplementation("junit:junit:4.13.2")
}

val gameAssets = layout.buildDirectory.dir("generated/gameassets")

val copyGameAsset = tasks.register<Copy>("copyGameAsset") {
    from(rootProject.layout.projectDirectory.file("../index.html"))
    from(rootProject.layout.projectDirectory.file("../menu-input.js"))
    into(gameAssets)
}

val copyForest = tasks.register<Copy>("copyForest") {
    from(rootProject.layout.projectDirectory.dir("../forest"))
    into(gameAssets.map { it.dir("forest") })
}

android.sourceSets.getByName("main").assets.srcDir(gameAssets)

tasks.configureEach {
    if (name.startsWith("merge") && name.endsWith("Assets")) {
        dependsOn(copyGameAsset, copyForest)
    }
}
