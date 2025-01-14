/*
Copyright 2015, 2016 OpenMarket Ltd
Copyright 2019 The Matrix.org Foundation C.I.C.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import React from "react";
import PropTypes from "prop-types";

const Spinner = ({
  w = 32,
  h = 32,
  message,
}: {
  w?: number;
  h?: number;
  message?: string;
}) => (
  <div className="mx_Spinner">
    {message && (
      <React.Fragment>
        <div className="mx_Spinner_Msg">{message}</div>&nbsp;
      </React.Fragment>
    )}
    <div
      className="mx_Spinner_icon"
      style={{ width: w, height: h }}
      aria-label={"Loading..."}></div>
  </div>
);

Spinner.propTypes = {
  w: PropTypes.number,
  h: PropTypes.number,
  message: PropTypes.node,
};

export default Spinner;
