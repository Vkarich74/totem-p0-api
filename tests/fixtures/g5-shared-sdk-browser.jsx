import React from "react";
import {createRoot} from "react-dom/client";
import * as api from "./src/api/internal.js";
import {readSharedCapabilities} from "./src/us/sharedRoleContract.js";
import SharedMasterCabinet from "./src/us/SharedMasterCabinet.jsx";
const root=createRoot(document.getElementById("root"));
window.__G5={api,readSharedCapabilities,mount:(slug,session)=>root.render(<SharedMasterCabinet slug={slug} session={session}/>)};
