CREATE TABLE `Users` (
    `UserID` INT AUTO_INCREMENT PRIMARY KEY,
    `username` VARCHAR(255) NOT NULL UNIQUE
);

CREATE TABLE `Cookies` (
    `CookieID` INT AUTO_INCREMENT PRIMARY KEY,
    `UserID` INT NOT NULL UNIQUE,
    `CFID` VARCHAR(255) NOT NULL ,
    `CFTOKEN` VARCHAR(255) NOT NULL ,
    `SESSIONID` VARCHAR(255) NOT NULL ,
    `SESSIONTOKEN` VARCHAR(255) NOT NULL ,
    FOREIGN KEY (`UserID`) REFERENCES `Users`(`UserID`) ON DELETE CASCADE ON UPDATE CASCADE
);

--@block
SELECT * FROM Cookies
--@block
SELECT * FROM Users
--@block
SHOW TABLES;
--@block
DROP TABLE Cookies, Users;
--@block // kian
INSERT INTO `Users` (`username`) VALUES
('Kian');

INSERT INTO `Cookies` (`UserID`, `CFID`, `CFTOKEN`, `SESSIONID`, `SESSIONTOKEN`) VALUES
(1, '6125577', 'b94688097db5ba80-8C18676E-C96C-A1C6-68EF9CC0032F1F69', '8C18BE57%2DA308%2D57CA%2D5CE35DF9CFDB859C', '8C18BE56%2D929D%2DDA94%2D9A71837D123532E5');

--@block // admin
INSERT INTO `Users` (`username`) VALUES
('admin');

INSERT INTO `Cookies` (`UserID`, `CFID`, `CFTOKEN`, `SESSIONID`, `SESSIONTOKEN`) VALUES
(2, '5670738', 'c1fcb3c99f098fd9-A65FB29C-C715-2833-76D2EDDA6F0EE9A5', 'B100257E%2DE2E0%2DED47%2D96CAFFA0D3CB3D56', 'B100257D%2D0D3C%2D62A1%2D5C2D46DA5EDFB05B');

--@block // sarah
INSERT INTO `Users` (`username`) VALUES
('sarah');

INSERT INTO `Cookies` (`UserID`, `CFID`, `CFTOKEN`, `SESSIONID`, `SESSIONTOKEN`) VALUES
(2, '5683871', '456f408c879672bd-E224A50F-0ACA-232E-AC5DB54C9365DD70', 'FB6CBDEB%2DD2F3%2D8F99%2D2575405B03BDAE1A', 'FB6CBDEA%2DE4C7%2D6236%2DAF0B4F02A850C371');
