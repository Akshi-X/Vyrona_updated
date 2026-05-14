/**
 * @variant AlertSettingHospital6
 * @hospital Yellow IVF (ID: 6)
 * @route /alert-setting
 * Custom Alert Setting for Yellow IVF.
 *
 * Uses the base AlertSetting page but wraps it in a pale yellow background.
 */

import React from "react";
import AlertSetting from "../../pages/AlertSetting";

const AlertSettingHospital6: React.FC = () => {
    return (
        <div className="min-h-screen bg-[#fefce8]">
          <div className="flex w-full absolute top-0 left-0 z-50 bg-[#fefce8]">
sdasdas
          </div>
            <AlertSetting />
        </div>
    );
};

export default AlertSettingHospital6;
